import {
  BadRequestException,
  ConflictException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { Prisma, RoleCode, User } from "@prisma/client";
import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "crypto";
import { Request } from "express";
import { PasswordService } from "../common/auth/password.service";
import { PrismaService } from "../common/database/prisma.service";
import {
  AuthenticatedUser,
  JwtPayload,
} from "../common/types/authenticated-user";
import { PermissionsService } from "../permissions/permissions.service";
import { RolesService } from "../roles/roles.service";
import { UsersService } from "../users/users.service";
import {
  ConfirmPasswordResetRequest,
  ConfirmPhoneVerificationRequest,
  DeactivateAccountRequest,
  GoogleAuthRequest,
  LoginRequest,
  RefreshRequest,
  RegisterRequest,
  RequestPasswordResetRequest,
} from "./dto/auth.schemas";
import { KycService } from "../users/kyc.service";
import { SmsDeliveryService } from "../common/sms/sms-delivery.service";

export interface AuthSession {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string | null;
    phone: string | null;
    firstName: string;
    lastName: string;
    roles: RoleCode[];
    phoneVerified: boolean;
  };
  phoneVerification?: { id: string; expiresAt: Date; developmentCode?: string };
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
    private readonly kycService: KycService,
    private readonly smsDelivery: SmsDeliveryService,
  ) {}

  async register(
    input: RegisterRequest,
    request: Request,
  ): Promise<AuthSession> {
    await this.rolesService.findByCodeOrThrow(input.role);
    const passwordHash = await this.passwordService.hash(input.password);

    let user: User;
    try {
      user = await this.usersService.createLocalUser({
        email: input.email,
        phone: input.phone,
        firstName: input.firstName,
        lastName: input.lastName,
        passwordHash,
        role: input.role,
        dateOfBirth: input.dateOfBirth,
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const target = Array.isArray(error.meta?.target)
          ? error.meta.target.join(",")
          : String(error.meta?.target ?? "");
        throw new ConflictException(
          target.includes("phone")
            ? "An account with this phone number already exists"
            : "An account with this email already exists",
        );
      }
      throw error;
    }

    try {
      const phoneVerification = await this.issuePhoneChallenge(
        user,
        input.phone,
      );
      const session = await this.createSession(user, request);
      return { ...session, phoneVerification };
    } catch (error) {
      // A person must not be left with an inaccessible account when the first
      // required SMS could not be issued. Cascades remove empty role/profile
      // records as well.
      await this.prisma.user
        .delete({ where: { id: user.id } })
        .catch(() => undefined);
      throw error;
    }
  }

  async login(input: LoginRequest, request: Request): Promise<AuthSession> {
    const user = input.identifier.includes("@")
      ? await this.usersService.findByEmail(input.identifier)
      : await this.usersService.findByPhone(input.identifier);
    const passwordMatches = user?.passwordHash
      ? await this.passwordService.verify(input.password, user.passwordHash)
      : false;

    if (!user || !passwordMatches) {
      throw new UnauthorizedException(
        "Invalid phone number or email, or password",
      );
    }

    await this.usersService.assertCanAuthenticate(user);
    return this.createSession(user, request);
  }

  async google(
    input: GoogleAuthRequest,
    request: Request,
  ): Promise<AuthSession> {
    const clientId = this.configService.get<string>("GOOGLE_OAUTH_CLIENT_ID");
    if (!clientId) {
      throw new ServiceUnavailableException("Google sign-in is not configured");
    }
    const tokenInfoUrl = this.configService.getOrThrow<string>(
      "GOOGLE_TOKEN_INFO_URL",
    );
    const response = await fetch(
      `${tokenInfoUrl}?id_token=${encodeURIComponent(input.idToken)}`,
    ).catch(() => undefined);
    const payload: unknown = response?.ok
      ? await response.json().catch(() => undefined)
      : undefined;
    const token =
      payload && typeof payload === "object"
        ? (payload as Record<string, unknown>)
        : undefined;
    const email =
      typeof token?.email === "string"
        ? token.email.trim().toLowerCase()
        : undefined;
    const audience = typeof token?.aud === "string" ? token.aud : undefined;
    const issuer = typeof token?.iss === "string" ? token.iss : undefined;
    const verified =
      token?.email_verified === "true" || token?.email_verified === true;
    if (
      !email ||
      audience !== clientId ||
      !verified ||
      !["accounts.google.com", "https://accounts.google.com"].includes(
        issuer ?? "",
      )
    ) {
      throw new UnauthorizedException(
        "Google identity token could not be verified",
      );
    }
    let user = await this.usersService.findByEmail(email);
    let createdUser = false;
    if (!user) {
      const givenName =
        typeof token?.given_name === "string" ? token.given_name : "SingleRent";
      const familyName =
        typeof token?.family_name === "string" ? token.family_name : "Member";
      if (!input.phone) {
        throw new BadRequestException(
          "A phone number is required to create a SingleRent account",
        );
      }
      let created: User;
      try {
        created = await this.usersService.createLocalUser({
          email,
          phone: input.phone,
          firstName: givenName,
          lastName: familyName,
          role: input.role,
          dateOfBirth: input.dateOfBirth,
        });
      } catch (error: unknown) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        ) {
          const target = Array.isArray(error.meta?.target)
            ? error.meta.target.join(",")
            : String(error.meta?.target ?? "");
          throw new ConflictException(
            target.includes("phone")
              ? "An account with this phone number already exists"
              : "An account with this email already exists",
          );
        }
        throw error;
      }
      await this.prisma.user.update({
        where: { id: created.id },
        data: { emailVerifiedAt: new Date() },
      });
      user = await this.usersService.findByEmail(email);
      createdUser = true;
    } else if (!user.emailVerifiedAt) {
      // A verified Google identity for the same address proves control of it.
      await this.prisma.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });
      user = await this.usersService.findByEmail(email);
    }
    if (!user) {
      throw new UnauthorizedException("Unable to create Google account");
    }
    await this.usersService.assertCanAuthenticate(user);
    const session = await this.createSession(user, request);
    if (!createdUser) return session;
    try {
      const phoneVerification = await this.issuePhoneChallenge(
        user,
        input.phone!,
      );
      return { ...session, phoneVerification };
    } catch (error) {
      await this.prisma.user
        .delete({ where: { id: user.id } })
        .catch(() => undefined);
      throw error;
    }
  }

  async refresh(input: RefreshRequest, request: Request): Promise<AuthSession> {
    const tokenHash = this.hashRefreshToken(input.refreshToken);
    const now = new Date();

    const rotated = await this.prisma.$transaction(async (transaction) => {
      const token = await transaction.refreshToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });

      if (
        !token ||
        token.revokedAt ||
        token.expiresAt <= now ||
        token.user.status !== "ACTIVE"
      ) {
        if (token) {
          await transaction.refreshToken.updateMany({
            where: { familyId: token.familyId, revokedAt: null },
            data: { revokedAt: now },
          });
        }
        throw new UnauthorizedException("Refresh token is invalid or expired");
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
        throw new UnauthorizedException("Refresh token has already been used");
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

  async logout(
    input: RefreshRequest,
    currentUser: AuthenticatedUser,
  ): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: {
        tokenHash: this.hashRefreshToken(input.refreshToken),
        userId: currentUser.userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  async issuePhoneVerification(currentUser: AuthenticatedUser, phone?: string) {
    const user = await this.usersService.findByIdOrThrow(currentUser.userId);
    const recipient = phone ?? user.phone;
    if (!recipient) {
      throw new BadRequestException(
        "Enter the phone number that should receive your verification code",
      );
    }
    if (user.phoneVerifiedAt && recipient === user.phone) {
      throw new ConflictException(
        "Your phone number has already been verified",
      );
    }
    return this.issuePhoneChallenge(user, recipient, true);
  }

  async confirmPhoneVerification(
    currentUser: AuthenticatedUser,
    input: ConfirmPhoneVerificationRequest,
  ) {
    await this.kycService.confirmPhoneChallenge(currentUser.userId, input);
    return { verified: true };
  }

  /** Always returns the same response to avoid disclosing which phones exist. */
  async requestPasswordReset(
    input: RequestPasswordResetRequest,
    request: Request,
  ) {
    const user = await this.usersService.findByPhone(input.phone);
    // The challenge id is an opaque public handle, not a credential. Returning
    // a random handle for an unknown phone lets the browser complete the same
    // UI flow without revealing whether an account exists.
    if (!user) return { requested: true, challengeId: randomUUID() };

    const code = this.createOtp();
    const now = new Date();
    const challenge = await this.prisma.$transaction(async (transaction) => {
      await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`password-reset:${user.id}`}))`;
      await transaction.passwordResetChallenge.updateMany({
        where: { userId: user.id, consumedAt: null },
        data: { consumedAt: now },
      });
      const created = await transaction.passwordResetChallenge.create({
        data: {
          userId: user.id,
          codeHash: this.hashVerificationCode(code),
          expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
          requestedIp: request.ip,
        },
        select: { id: true, expiresAt: true },
      });
      return created;
    });
    await this.smsDelivery.sendOtp(user.phone!, code, "password reset");
    return {
      requested: true,
      challengeId: challenge.id,
      ...(this.configService.get<string>("NODE_ENV") === "development"
        ? { developmentCode: code }
        : {}),
    };
  }

  async confirmPasswordReset(
    input: ConfirmPasswordResetRequest,
  ): Promise<void> {
    const user = await this.usersService.findByPhone(input.phone);
    const now = new Date();
    const valid = user
      ? await this.prisma.passwordResetChallenge.findFirst({
          where: { id: input.challengeId, userId: user.id },
        })
      : null;
    if (
      !valid ||
      valid.consumedAt ||
      valid.expiresAt <= now ||
      valid.attempts >= 5
    ) {
      throw new BadRequestException(
        "Password reset code is invalid or expired",
      );
    }
    if (!this.matchesVerificationCode(input.code, valid.codeHash)) {
      await this.prisma.passwordResetChallenge.updateMany({
        where: {
          id: valid.id,
          consumedAt: null,
          attempts: { lt: 5 },
          expiresAt: { gt: now },
        },
        data: { attempts: { increment: 1 } },
      });
      throw new BadRequestException(
        "Password reset code is invalid or expired",
      );
    }
    const passwordHash = await this.passwordService.hash(input.password);
    await this.prisma.$transaction(async (transaction) => {
      const consumed = await transaction.passwordResetChallenge.updateMany({
        where: {
          id: valid.id,
          consumedAt: null,
          attempts: { lt: 5 },
          expiresAt: { gt: now },
        },
        data: { consumedAt: now },
      });
      if (consumed.count !== 1)
        throw new BadRequestException(
          "Password reset code is invalid or expired",
        );
      await transaction.passwordResetChallenge.updateMany({
        where: { userId: user!.id, consumedAt: null },
        data: { consumedAt: now },
      });
      await transaction.user.update({
        where: { id: user!.id },
        data: { passwordHash },
      });
      await transaction.refreshToken.updateMany({
        where: { userId: user!.id, revokedAt: null },
        data: { revokedAt: now },
      });
    });
  }

  async deactivateAccount(
    currentUser: AuthenticatedUser,
    input: DeactivateAccountRequest,
  ): Promise<void> {
    const user = await this.usersService.findByIdOrThrow(currentUser.userId);
    if (user.passwordHash) {
      if (
        !input.currentPassword ||
        !(await this.passwordService.verify(
          input.currentPassword,
          user.passwordHash,
        ))
      ) {
        throw new UnauthorizedException(
          "Enter your current password to deactivate this account",
        );
      }
    }
    await this.usersService.deactivate(user.id);
  }

  async me(currentUser: AuthenticatedUser): Promise<AuthSession["user"]> {
    const user = await this.usersService.findByIdOrThrow(currentUser.userId);
    const authorization = await this.permissionsService.getAuthorizationContext(
      user.id,
    );
    return this.serializeUser(user, authorization.roles);
  }

  private async createSession(
    user: User,
    request: Request,
    rotatedRefreshToken?: string,
  ): Promise<AuthSession> {
    const authorization = await this.permissionsService.getAuthorizationContext(
      user.id,
    );
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email ?? undefined,
      tokenType: "access",
    };
    const accessToken = await this.jwtService.signAsync(payload, {
      expiresIn: this.configService.getOrThrow<string>(
        "JWT_ACCESS_TTL",
      ) as never,
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
    return {
      accessToken,
      refreshToken,
      user: this.serializeUser(user, authorization.roles),
    };
  }

  private serializeUser(user: User, roles: RoleCode[]): AuthSession["user"] {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      firstName: user.firstName,
      lastName: user.lastName,
      roles,
      phoneVerified: Boolean(user.phoneVerifiedAt),
    };
  }

  private issuePhoneChallenge(user: User, phone: string, throttle = false) {
    return this.kycService.sendPhoneChallenge(user.id, { phone }, throttle);
  }

  private hashVerificationCode(value: string): string {
    // Domain-separate OTP hashes from other uses of the existing server-only secret.
    return createHmac(
      "sha256",
      this.configService.getOrThrow<string>("JWT_ACCESS_SECRET"),
    )
      .update(`singlerent-otp:${value}`)
      .digest("hex");
  }

  private createOtp(): string {
    return String(randomInt(100_000, 1_000_000));
  }

  private matchesVerificationCode(value: string, stored: string): boolean {
    // Existing short-lived challenges remain valid during a rolling deployment.
    const b = Buffer.from(stored);
    const candidates = [
      this.hashVerificationCode(value),
      createHash("sha256").update(value).digest("hex"),
    ];
    return candidates.some((candidate) => {
      const a = Buffer.from(candidate);
      return a.length === b.length && timingSafeEqual(a, b);
    });
  }

  private createRawRefreshToken(): string {
    return randomBytes(48).toString("base64url");
  }

  private hashRefreshToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  private refreshTokenExpiry(): Date {
    const days = this.configService.getOrThrow<number>("JWT_REFRESH_TTL_DAYS");
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  }

  private getUserAgent(request: Request): string | undefined {
    const value = request.headers["user-agent"];
    return typeof value === "string" ? value.slice(0, 500) : undefined;
  }
}
