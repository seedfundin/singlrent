import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, RoleCode, User } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { Request } from 'express';
import { PasswordService } from '../common/auth/password.service';
import { PrismaService } from '../common/database/prisma.service';
import { AuthenticatedUser, JwtPayload } from '../common/types/authenticated-user';
import { PermissionsService } from '../permissions/permissions.service';
import { RolesService } from '../roles/roles.service';
import { UsersService } from '../users/users.service';
import { ConfirmEmailVerificationRequest, GoogleAuthRequest, LoginRequest, RefreshRequest, RegisterRequest } from './dto/auth.schemas';

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    roles: RoleCode[];
    emailVerified: boolean;
  };
  emailVerification?: { id: string; expiresAt: Date; developmentCode?: string };
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly rolesService: RolesService,
    private readonly permissionsService: PermissionsService,
    private readonly passwordService: PasswordService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) {}

  async register(input: RegisterRequest, request: Request): Promise<AuthSession> {
    await this.rolesService.findByCodeOrThrow(input.role);
    const passwordHash = await this.passwordService.hash(input.password);

    let user: User;
    try {
      user = await this.usersService.createLocalUser({
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        passwordHash,
        role: input.role,
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }

    const [session, emailVerification] = await Promise.all([
      this.createSession(user, request),
      this.issueEmailChallenge(user),
    ]);
    return { ...session, emailVerification };
  }

  async login(input: LoginRequest, request: Request): Promise<AuthSession> {
    const user = await this.usersService.findByEmail(input.email);
    const passwordMatches = user?.passwordHash
      ? await this.passwordService.verify(input.password, user.passwordHash)
      : false;

    if (!user || !passwordMatches) {
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.usersService.assertCanAuthenticate(user);
    return this.createSession(user, request);
  }

  async google(input: GoogleAuthRequest, request: Request): Promise<AuthSession> {
    const clientId = this.configService.get<string>('GOOGLE_OAUTH_CLIENT_ID');
    if (!clientId) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }
    const tokenInfoUrl = this.configService.getOrThrow<string>('GOOGLE_TOKEN_INFO_URL');
    const response = await fetch(`${tokenInfoUrl}?id_token=${encodeURIComponent(input.idToken)}`).catch(() => undefined);
    const payload: unknown = response?.ok ? await response.json().catch(() => undefined) : undefined;
    const token = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : undefined;
    const email = typeof token?.email === 'string' ? token.email.trim().toLowerCase() : undefined;
    const audience = typeof token?.aud === 'string' ? token.aud : undefined;
    const verified = token?.email_verified === 'true' || token?.email_verified === true;
    if (!email || audience !== clientId || !verified) {
      throw new UnauthorizedException('Google identity token could not be verified');
    }
    let user = await this.usersService.findByEmail(email);
    if (!user) {
      const givenName = typeof token?.given_name === 'string' ? token.given_name : 'SingleRent';
      const familyName = typeof token?.family_name === 'string' ? token.family_name : 'Member';
      const created = await this.usersService.createLocalUser({
        email,
        firstName: givenName,
        lastName: familyName,
        role: input.role,
      });
      await this.prisma.user.update({ where: { id: created.id }, data: { emailVerifiedAt: new Date() } });
      user = await this.usersService.findByEmail(email);
    }
    if (!user) {
      throw new UnauthorizedException('Unable to create Google account');
    }
    await this.usersService.assertCanAuthenticate(user);
    return this.createSession(user, request);
  }

  async refresh(input: RefreshRequest, request: Request): Promise<AuthSession> {
    const tokenHash = this.hashRefreshToken(input.refreshToken);
    const now = new Date();

    const rotated = await this.prisma.$transaction(async (transaction) => {
      const token = await transaction.refreshToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });

      if (!token || token.revokedAt || token.expiresAt <= now || token.user.status !== 'ACTIVE') {
        if (token) {
          await transaction.refreshToken.updateMany({
            where: { familyId: token.familyId, revokedAt: null },
            data: { revokedAt: now },
          });
        }
        throw new UnauthorizedException('Refresh token is invalid or expired');
      }

      // Conditional revocation ensures concurrent refresh attempts cannot both succeed.
      const revoked = await transaction.refreshToken.updateMany({
        where: { id: token.id, revokedAt: null },
        data: { revokedAt: now },
      });
      if (revoked.count !== 1) {
        await transaction.refreshToken.updateMany({
          where: { familyId: token.familyId, revokedAt: null },
          data: { revokedAt: now },
        });
        throw new UnauthorizedException('Refresh token has already been used');
      }

      const refreshToken = this.createRawRefreshToken();
      await transaction.refreshToken.create({
        data: {
          userId: token.userId,
          tokenHash: this.hashRefreshToken(refreshToken),
          familyId: token.familyId,
          expiresAt: this.refreshTokenExpiry(),
          userAgent: this.getUserAgent(request),
          ipAddress: request.ip,
        },
      });

      return { user: token.user, refreshToken };
    });

    return this.createSession(rotated.user, request, rotated.refreshToken);
  }

  async logout(input: RefreshRequest, currentUser: AuthenticatedUser): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: this.hashRefreshToken(input.refreshToken),
        userId: currentUser.userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  async resendEmailVerification(currentUser: AuthenticatedUser) {
    const user = await this.usersService.findByIdOrThrow(currentUser.userId);
    if (user.emailVerifiedAt) {
      throw new ConflictException('Your email address has already been verified');
    }
    return this.issueEmailChallenge(user);
  }

  async confirmEmailVerification(currentUser: AuthenticatedUser, input: ConfirmEmailVerificationRequest) {
    const now = new Date();
    await this.prisma.$transaction(async (transaction) => {
      const challenge = await transaction.emailVerificationChallenge.findFirst({
        where: { id: input.challengeId, userId: currentUser.userId },
      });
      if (!challenge || challenge.consumedAt || challenge.expiresAt <= now || challenge.attempts >= 5) {
        throw new BadRequestException('Email verification code is invalid or expired');
      }
      if (this.hashVerificationCode(input.code) !== challenge.codeHash) {
        await transaction.emailVerificationChallenge.update({
          where: { id: challenge.id },
          data: { attempts: { increment: 1 } },
        });
        throw new BadRequestException('Email verification code is invalid');
      }
      await transaction.emailVerificationChallenge.update({ where: { id: challenge.id }, data: { consumedAt: now } });
      await transaction.user.update({ where: { id: currentUser.userId }, data: { emailVerifiedAt: now } });
    });
    return { verified: true };
  }

  async me(currentUser: AuthenticatedUser): Promise<AuthSession['user']> {
    const user = await this.usersService.findByIdOrThrow(currentUser.userId);
    const authorization = await this.permissionsService.getAuthorizationContext(user.id);
    return this.serializeUser(user, authorization.roles);
  }

  private async createSession(
    user: User,
    request: Request,
    rotatedRefreshToken?: string,
  ): Promise<AuthSession> {
    const authorization = await this.permissionsService.getAuthorizationContext(user.id);
    const payload: JwtPayload = { sub: user.id, email: user.email, tokenType: 'access' };
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: this.configService.getOrThrow<string>('JWT_ACCESS_TTL') as never,
    });
    const refreshToken = rotatedRefreshToken ?? this.createRawRefreshToken();

    if (!rotatedRefreshToken) {
      await this.prisma.refreshToken.create({
        data: {
          userId: user.id,
          tokenHash: this.hashRefreshToken(refreshToken),
          familyId: randomUUID(),
          expiresAt: this.refreshTokenExpiry(),
          userAgent: this.getUserAgent(request),
          ipAddress: request.ip,
        },
      });
    }

    await this.usersService.markActive(user.id);
    return { accessToken, refreshToken, user: this.serializeUser(user, authorization.roles) };
  }

  private serializeUser(user: User, roles: RoleCode[]): AuthSession['user'] {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      roles,
      emailVerified: Boolean(user.emailVerifiedAt),
    };
  }

  private async issueEmailChallenge(user: User) {
    const code = String(Math.floor(100_000 + Math.random() * 900_000));
    const now = new Date();
    const challenge = await this.prisma.$transaction(async (transaction) => {
      await transaction.emailVerificationChallenge.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: now },
      });
      return transaction.emailVerificationChallenge.create({
        data: {
          userId: user.id,
          email: user.email,
          codeHash: this.hashVerificationCode(code),
          expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
        },
        select: { id: true, expiresAt: true },
      });
    });

    // A delivery provider will replace this development-only disclosure.
    return {
      ...challenge,
      ...(this.configService.get<string>('NODE_ENV') === 'development' ? { developmentCode: code } : {}),
    };
  }

  private hashVerificationCode(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private createRawRefreshToken(): string {
    return randomBytes(48).toString('base64url');
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private refreshTokenExpiry(): Date {
    const days = this.configService.getOrThrow<number>('JWT_REFRESH_TTL_DAYS');
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private getUserAgent(request: Request): string | undefined {
    const value = request.headers['user-agent'];
    return typeof value === 'string' ? value.slice(0, 500) : undefined;
  }
}
