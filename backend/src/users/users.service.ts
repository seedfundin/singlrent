import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma, RoleCode, User, UserStatus } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';

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

  async findByIdOrThrow(userId: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async createLocalUser(input: {
    email: string;
    firstName: string;
    lastName: string;
    passwordHash?: string;
    role: RoleCode;
  }): Promise<User> {
    return this.prisma.$transaction(async (transaction) => {
      const user = await transaction.user.create({
        data: {
          email: this.normalizeEmail(input.email),
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
        await transaction.agentProfile.create({ data: { userId: user.id } });
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

  async assertCanAuthenticate(user: Pick<User, 'status'>): Promise<void> {
    if (user.status !== UserStatus.ACTIVE) {
      throw new UnauthorizedException('This account is not active');
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
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async updateProfile(
    userId: string,
    input: {
      firstName?: string;
      lastName?: string;
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
    return this.prisma.$transaction(async (transaction) => {
      await transaction.user.update({
        where: { id: userId },
        data: {
          firstName: input.firstName?.trim(),
          lastName: input.lastName?.trim(),
          bio: input.bio,
          profileImageUrl: input.profileImageUrl,
          profileImagePublicId: input.profileImagePublicId,
        },
      });

      if (input.occupation !== undefined || input.defaultOccupants !== undefined) {
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
      if (input.companyName !== undefined || input.licenceNumber !== undefined) {
        await transaction.agentProfile.upsert({
          where: { userId },
          create: { userId, companyName: input.companyName, licenceNumber: input.licenceNumber },
          update: { companyName: input.companyName, licenceNumber: input.licenceNumber },
        });
      }
      return this.getProfile(userId);
    });
  }

  private normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
  }
}
