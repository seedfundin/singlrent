import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KycStatus, ListingStatus, PermissionEffect, Prisma, RoleCode, UserStatus } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PasswordService } from '../common/auth/password.service';
import { AuditService } from '../common/database/audit.service';
import { pageResult } from '../common/http/pagination';
import { PrismaService } from '../common/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import {
  AcceptAdminInvitationRequest,
  AdminUserQuery,
  AssignRoleRequest,
  CreateAdminInvitationRequest,
  ModerateListingRequest,
  ReviewKycRequest,
  UpdatePermissionsRequest,
  UpdateUserStatusRequest,
} from './dto/admin.schemas';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly audit: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  async listUsers(query: AdminUserQuery) {
    const where: Prisma.UserWhereInput = {
      status: query.status,
      userRoles: query.role ? { some: { role: { code: query.role } } } : undefined,
      OR: query.search
        ? [
            { email: { contains: query.search, mode: 'insensitive' } },
            { firstName: { contains: query.search, mode: 'insensitive' } },
            { lastName: { contains: query.search, mode: 'insensitive' } },
          ]
        : undefined,
    };
    const include = {
      userRoles: { include: { role: true } },
      directPermissions: { include: { permission: true } },
      kyc: { select: { status: true, phoneStatus: true, ninStatus: true, updatedAt: true } },
    } satisfies Prisma.UserInclude;
    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        include,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);
    return pageResult(items, total, query);
  }

  async updateUserStatus(actorId: string, userId: string, input: UpdateUserStatusRequest) {
    if (actorId === userId && input.status !== UserStatus.ACTIVE) {
      throw new ForbiddenException('You cannot deactivate your own account');
    }
    const user = await this.prisma.user.update({ where: { id: userId }, data: { status: input.status } });
    await this.audit.record({ actorUserId: actorId, action: 'admin.user_status_updated', entityType: 'user', entityId: userId, metadata: { status: input.status } });
    return user;
  }

  async assignRole(actorId: string, userId: string, input: AssignRoleRequest) {
    const role = await this.prisma.role.findUnique({ where: { code: input.role } });
    if (!role) {
      throw new NotFoundException('Role not found');
    }
    await this.prisma.userRole.upsert({
      where: { userId_roleId: { userId, roleId: role.id } },
      create: { userId, roleId: role.id, assignedBy: actorId },
      update: { assignedBy: actorId, assignedAt: new Date() },
    });
    await this.audit.record({ actorUserId: actorId, action: 'admin.role_assigned', entityType: 'user', entityId: userId, metadata: { role: input.role } });
  }

  async setDirectPermissions(actorId: string, userId: string, input: UpdatePermissionsRequest) {
    const permissionKeys = input.permissions.map((permission) => permission.key);
    const permissions = await this.prisma.permission.findMany({ where: { key: { in: permissionKeys } } });
    if (permissions.length !== permissionKeys.length) {
      throw new NotFoundException('One or more permissions were not found');
    }
    const permissionMap = new Map(permissions.map((permission) => [permission.key, permission.id]));
    await this.prisma.$transaction(async (transaction) => {
      await transaction.userPermission.deleteMany({ where: { userId } });
      if (input.permissions.length) {
        await transaction.userPermission.createMany({
          data: input.permissions.map((permission) => ({
            userId,
            permissionId: permissionMap.get(permission.key)!,
            effect: permission.effect as PermissionEffect,
            assignedBy: actorId,
          })),
        });
      }
    });
    await this.audit.record({ actorUserId: actorId, action: 'admin.permissions_updated', entityType: 'user', entityId: userId, metadata: { permissions: input.permissions } });
  }

  async createInvitation(actorId: string, input: CreateAdminInvitationRequest) {
    const rawToken = randomBytes(32).toString('base64url');
    const invitation = await this.prisma.adminInvitation.upsert({
      where: { email: input.email },
      create: {
        email: input.email,
        tokenHash: this.hashToken(rawToken),
        role: input.role,
        adminTitle: input.adminTitle,
        invitedByUserId: actorId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
      update: {
        tokenHash: this.hashToken(rawToken),
        role: input.role,
        adminTitle: input.adminTitle,
        invitedByUserId: actorId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        acceptedAt: null,
        acceptedByUserId: null,
        revokedAt: null,
      },
      select: { id: true, email: true, role: true, adminTitle: true, expiresAt: true },
    });
    await this.audit.record({ actorUserId: actorId, action: 'admin.invitation_created', entityType: 'admin_invitation', entityId: invitation.id, metadata: { email: invitation.email, role: invitation.role } });
    return {
      ...invitation,
      ...(this.configService.get<string>('NODE_ENV') === 'development' ? { developmentInviteToken: rawToken } : {}),
    };
  }

  async acceptInvitation(input: AcceptAdminInvitationRequest) {
    const invitation = await this.prisma.adminInvitation.findUnique({ where: { tokenHash: this.hashToken(input.token) } });
    if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
      throw new ConflictException('This invitation is invalid or expired');
    }
    const existing = await this.prisma.user.findUnique({ where: { email: invitation.email }, select: { id: true } });
    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }
    const passwordHash = await this.passwordService.hash(input.password);
    const user = await this.usersService.createLocalUser({
      email: invitation.email,
      firstName: input.firstName,
      lastName: input.lastName,
      passwordHash,
      role: invitation.role,
    });
    await this.prisma.adminInvitation.update({ where: { id: invitation.id }, data: { acceptedByUserId: user.id, acceptedAt: new Date() } });
    return { id: user.id, email: user.email, role: invitation.role };
  }

  async reviewKyc(actorId: string, userId: string, input: ReviewKycRequest) {
    if (!input.approved && !input.rejectionReason) {
      throw new ConflictException('Provide a rejection reason when declining KYC');
    }
    const kyc = await this.prisma.kycProfile.findUnique({ where: { userId } });
    if (!kyc) {
      throw new NotFoundException('KYC profile not found');
    }
    const status = input.approved ? KycStatus.VERIFIED : KycStatus.REJECTED;
    const updated = await this.prisma.kycProfile.update({
      where: { userId },
      data: {
        status,
        ninStatus: status,
        verifiedAt: input.approved ? new Date() : null,
        reviewedAt: new Date(),
        reviewedByUserId: actorId,
        rejectionReason: input.approved ? null : input.rejectionReason,
      },
    });
    await this.notificationsService.create({
      userId,
      type: 'KYC_UPDATED',
      title: input.approved ? 'KYC verified' : 'KYC needs attention',
      body: input.approved ? 'Your identity verification is complete.' : 'Your KYC submission requires an update.',
      data: { status },
    });
    return updated;
  }

  async moderateListing(actorId: string, listingId: string, action: 'approve' | 'reject' | 'suspend', input: ModerateListingRequest) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    const status = action === 'approve' ? ListingStatus.PUBLISHED : action === 'reject' ? ListingStatus.REJECTED : ListingStatus.SUSPENDED;
    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: { status, publishedAt: action === 'approve' ? new Date() : listing.publishedAt, moderatedByUserId: actorId, moderationNote: input.note },
    });
    const recipients = [listing.landlordId, listing.managingAgentId, listing.createdById].filter((id): id is string => Boolean(id));
    await Promise.all(
      [...new Set(recipients)].map((userId) =>
        this.notificationsService.create({
          userId,
          type: 'LISTING_STATUS_UPDATED',
          title: 'Listing status updated',
          body: `${listing.title} is now ${status.toLowerCase().replace('_', ' ')}.`,
          data: { listingId, status, note: input.note ?? null },
        }),
      ),
    );
    await this.audit.record({ actorUserId: actorId, action: `admin.listing_${action}`, entityType: 'listing', entityId: listingId, metadata: { note: input.note ?? null } });
    return updated;
  }

  listAuditLogs(query: AdminUserQuery) {
    return this.prisma.auditLog.findMany({
      include: { actor: { select: { id: true, firstName: true, lastName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
