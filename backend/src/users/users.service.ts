import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import {
  KycStatus,
  Prisma,
  PublisherVerificationStatus,
  RoleCode,
  User,
  UserStatus,
} from "@prisma/client";
import { PrismaService } from "../common/database/prisma.service";

export type UserWithRoles = Prisma.UserGetPayload<{
  include: { userRoles: { include: { role: true } } };
}>;

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  findByEmail(email: string): Promise<UserWithRoles | null> {
    return this.prisma.user.findUnique({
      where: { email: this.normalizeEmail(email) },
      include: { userRoles: { include: { role: true } } },
    });
  }

  findByPhone(phone: string): Promise<UserWithRoles | null> {
    return this.prisma.user.findUnique({
      where: { phone: this.normalizePhone(phone) },
      include: { userRoles: { include: { role: true } } },
    });
  }

  async findByIdOrThrow(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  async createLocalUser(input: {
    email?: string | null;
    phone?: string | null;
    firstName: string;
    lastName: string;
    passwordHash?: string;
    role: RoleCode;
    dateOfBirth?: Date;
  }): Promise<User> {
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          email: input.email ? this.normalizeEmail(input.email) : null,
          phone: input.phone ? this.normalizePhone(input.phone) : null,
          firstName: input.firstName.trim(),
          lastName: input.lastName.trim(),
          passwordHash: input.passwordHash,
          userRoles: {
            create: {
              role: { connect: { code: input.role } },
            },
          },
        },
      });

      await transaction.kycProfile.create({ data: { userId: user.id } });
      if (input.role === RoleCode.TENANT) {
        await transaction.tenantProfile.create({ data: { userId: user.id } });
      }
      if (input.role === RoleCode.LANDLORD) {
        await transaction.landlordProfile.create({ data: { userId: user.id } });
      }
      if (input.role === RoleCode.AGENT) {
        await transaction.agentProfile.create({
          data: { userId: user.id, dateOfBirth: input.dateOfBirth },
        });
      }
      return user;
    });
  }

  async markActive(userId: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { lastActiveAt: new Date() },
    });
  }

  async assertCanAuthenticate(user: Pick<User, "status">): Promise<void> {
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException("This account is not active");
    }
  }

  async deactivate(userId: string): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: userId },
        data: { status: UserStatus.DEACTIVATED },
      });
      await transaction.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  async assertPhoneVerified(userId: string): Promise<void> {
    const user = await this.findByIdOrThrow(userId);
    if (!user.phoneVerifiedAt) {
      throw new ForbiddenException(
        "Verify your phone number before continuing",
      );
    }
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        kyc: true,
        tenantProfile: true,
        landlordProfile: true,
        agentProfile: true,
        userRoles: { include: { role: true } },
      },
    });
    if (!user) {
      throw new NotFoundException("User not found");
    }
    return user;
  }

  async updateProfile(
    userId: string,
    input: {
      firstName?: string;
      lastName?: string;
      email?: string | null;
      bio?: string | null;
      profileImageUrl?: string | null;
      profileImagePublicId?: string | null;
      occupation?: string | null;
      defaultOccupants?: number;
      businessName?: string | null;
      companyName?: string | null;
      licenceNumber?: string | null;
    },
  ) {
    try {
      return await this.prisma.$transaction(async (transaction) => {
        const current = await transaction.user.findUnique({
          where: { id: userId },
          select: {
            firstName: true,
            lastName: true,
            kyc: { select: { status: true } },
            publisherVerification: { select: { status: true } },
          },
        });
        if (!current) throw new NotFoundException("User not found");
        const changingLegalName =
          (input.firstName !== undefined &&
            input.firstName.trim() !== current.firstName) ||
          (input.lastName !== undefined &&
            input.lastName.trim() !== current.lastName);
        const identityAlreadyVerified =
          current.kyc?.status === KycStatus.VERIFIED ||
          current.publisherVerification?.status ===
            PublisherVerificationStatus.VERIFIED;
        if (changingLegalName && identityAlreadyVerified) {
          throw new ConflictException(
            "Your legal name cannot be changed after identity verification. Contact SingleRent support if it needs correction.",
          );
        }
        await transaction.user.update({
          where: { id: userId },
          data: {
            firstName: input.firstName?.trim(),
            lastName: input.lastName?.trim(),
            email:
              input.email === undefined
                ? undefined
                : input.email
                  ? this.normalizeEmail(input.email)
                  : null,
            bio: input.bio,
            profileImageUrl: input.profileImageUrl,
            profileImagePublicId: input.profileImagePublicId,
          },
        });

        if (
          input.occupation !== undefined ||
          input.defaultOccupants !== undefined
        ) {
          await transaction.tenantProfile.upsert({
            where: { userId },
            create: {
              userId,
              occupation: input.occupation,
              defaultOccupants: input.defaultOccupants ?? 1,
            },
            update: {
              occupation: input.occupation,
              defaultOccupants: input.defaultOccupants,
            },
          });
        }
        if (input.businessName !== undefined) {
          await transaction.landlordProfile.upsert({
            where: { userId },
            create: { userId, businessName: input.businessName },
            update: { businessName: input.businessName },
          });
        }
        if (
          input.companyName !== undefined ||
          input.licenceNumber !== undefined
        ) {
          await transaction.agentProfile.upsert({
            where: { userId },
            create: {
              userId,
              companyName: input.companyName,
              licenceNumber: input.licenceNumber,
            },
            update: {
              companyName: input.companyName,
              licenceNumber: input.licenceNumber,
            },
          });
        }
        return this.getProfile(userId);
      });
    } catch (error: unknown) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        throw new ConflictException(
          "Another SingleRent account already uses that email address",
        );
      }
      throw error;
    }
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }

  private normalizePhone(phone: string): string {
    return phone.trim();
  }
}
