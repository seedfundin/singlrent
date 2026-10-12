import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KycStatus, ListingStatus, PermissionEffect, Prisma, RoleCode, UserStatus } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PasswordService } from '../common/auth/password.service';
import { AuditService } from '../common/database/audit.service';
import { pageResult } from '../common/http/pagination';
import { PrismaService } from '../common/database/prisma.service';
import { RedisService } from '../common/redis/redis.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UsersService } from '../users/users.service';
import {
  AcceptAdminInvitationRequest,
  AdminListingQuery,
  AdminMaintenanceQuery,
  AdminTransactionQuery,
  AdminUserQuery,
  AssignRoleRequest,
  CreateAdminInvitationRequest,
  ModerateListingRequest,
  ReviewKycRequest,
  UpdatePermissionsRequest,
  UpdateUserStatusRequest,
} from './dto/admin.schemas';

const adminListingInclude = {
  media: { orderBy: [{ mediaType: 'asc' as const }, { position: 'asc' as const }] },
  landlord: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } },
  managingAgent: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } },
  _count: { select: { savedBy: true, applications: true, maintenanceRequests: true } },
} satisfies Prisma.ListingInclude;

// Do not include provider payloads here. They can contain payment-provider data
// that is unnecessary for operational tracing. References, amounts, statuses and
// ledger movements are sufficient for authorized financial staff.
const adminTransactionInclude = {
  listing: { select: { id: true, slug: true, title: true, source: true } },
  application: { select: { id: true, status: true, moveInDate: true, leaseMonths: true } },
  tenant: { select: { id: true, firstName: true, lastName: true, email: true } },
  landlord: { select: { id: true, firstName: true, lastName: true, email: true } },
  agent: { select: { id: true, firstName: true, lastName: true, email: true } },
  escrow: {
    select: {
      id: true,
      status: true,
      cautionStatus: true,
      rentHeldKobo: true,
      cautionHeldKobo: true,
      releaseAuthorizedAt: true,
      releasedAt: true,
      cautionDeductions: {
        select: {
          id: true,
          amountKobo: true,
          reason: true,
          evidence: true,
          proposedByUserId: true,
          acceptedAt: true,
          disputedAt: true,
          resolvedAt: true,
          resolution: true,
          resolutionNote: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'asc' as const },
      },
    },
  },
  payouts: {
    select: {
      id: true,
      recipientUserId: true,
      kind: true,
      status: true,
      amountKobo: true,
      serviceFeeKobo: true,
      providerReference: true,
      scheduledAt: true,
      paidAt: true,
      createdAt: true,
      recipient: { select: { id: true, firstName: true, lastName: true, email: true } },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  ledgerEntries: {
    select: { id: true, entryType: true, debitAccount: true, creditAccount: true, amountKobo: true, currency: true, createdAt: true },
    orderBy: { createdAt: 'asc' as const },
  },
} satisfies Prisma.PaymentInclude;

const adminMaintenanceInclude = {
  listing: { select: { id: true, slug: true, title: true } },
  reporter: { select: { id: true, firstName: true, lastName: true } },
  landlord: { select: { id: true, firstName: true, lastName: true } },
  agent: { select: { id: true, firstName: true, lastName: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  _count: { select: { updates: true, attachments: true } },
} satisfies Prisma.MaintenanceRequestInclude;

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usersService: UsersService,
    private readonly passwordService: PasswordService,
    private readonly audit: AuditService,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
    private readonly redis: RedisService,
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

  async listListings(query: AdminListingQuery) {
    const where: Prisma.ListingWhereInput = { status: query.status };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.listing.findMany({
        where,
        include: adminListingInclude,
        orderBy: { updatedAt: 'asc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.listing.count({ where }),
    ]);
    return pageResult(items, total, query);
  }

  async listTransactions(query: AdminTransactionQuery) {
    const search = query.search;
    const where: Prisma.PaymentWhereInput = {
      status: query.status,
      OR: search
        ? [
            { reference: { contains: search, mode: 'insensitive' } },
            { providerReference: { contains: search, mode: 'insensitive' } },
            { listing: { title: { contains: search, mode: 'insensitive' } } },
            { tenant: { is: { OR: [{ firstName: { contains: search, mode: 'insensitive' } }, { lastName: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] } } },
            { landlord: { is: { OR: [{ firstName: { contains: search, mode: 'insensitive' } }, { lastName: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] } } },
            { agent: { is: { OR: [{ firstName: { contains: search, mode: 'insensitive' } }, { lastName: { contains: search, mode: 'insensitive' } }, { email: { contains: search, mode: 'insensitive' } }] } } },
            { payouts: { some: { providerReference: { contains: search, mode: 'insensitive' } } } },
          ]
        : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where,
        include: adminTransactionInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return pageResult(items.map((item) => ({ ...item, transactionReference: item.reference })), total, query);
  }

  async listMaintenance(query: AdminMaintenanceQuery) {
    const where: Prisma.MaintenanceRequestWhereInput = { status: query.status };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.maintenanceRequest.findMany({
        where,
        include: adminMaintenanceInclude,
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.maintenanceRequest.count({ where }),
    ]);
    return pageResult(items, total, query);
  }

  /** Operational health without exposing credential material or provider secrets. */
  async systemStates() {
    const checkedAt = new Date().toISOString();
    const [database, redis] = await Promise.all([
      this.prisma.$queryRawUnsafe('SELECT 1').then(() => 'operational' as const).catch(() => 'unavailable' as const),
      this.redis.client.ping().then((reply) => reply === 'PONG' ? 'operational' as const : 'unavailable' as const).catch(() => 'unavailable' as const),
    ]);
    return {
      checkedAt,
      api: 'operational' as const,
      database,
      redis,
      integrations: {
        paystack: this.configService.get<string>('PAYSTACK_SECRET_KEY') ? 'configured' as const : 'not_configured' as const,
        dojah: this.configService.get<string>('DOJAH_APP_ID') && this.configService.get<string>('DOJAH_SECRET_KEY') ? 'configured' as const : 'not_configured' as const,
        r2: this.configService.get<string>('CLOUDFLARE_R2_BUCKET_NAME') && this.configService.get<string>('CLOUDFLARE_R2_PUBLIC_URL') ? 'configured' as const : 'not_configured' as const,
      },
    };
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
    if (input.approved) {
      throw new ForbiddenException('KYC can only be verified by a successful Dojah NIN confirmation');
    }
    if (!input.approved && !input.rejectionReason) {
      throw new ConflictException('Provide a rejection reason when declining KYC');
    }
    const kyc = await this.prisma.kycProfile.findUnique({ where: { userId } });
    if (!kyc) {
      throw new NotFoundException('KYC profile not found');
    }
    const status = KycStatus.REJECTED;
    const updated = await this.prisma.kycProfile.update({
      where: { userId },
      data: {
        status,
        ninStatus: status,
        verifiedAt: null,
        reviewedAt: new Date(),
        reviewedByUserId: actorId,
        rejectionReason: input.rejectionReason,
      },
    });
    await this.notificationsService.create({
      userId,
      type: 'KYC_UPDATED',
      title: 'KYC needs attention',
      body: 'Your KYC submission requires an update.',
      data: { status },
    });
    return updated;
  }

  async moderateListing(actorId: string, listingId: string, action: 'approve' | 'reject' | 'suspend', input: ModerateListingRequest) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    if (action !== 'suspend') {
      throw new BadRequestException('Listings are published automatically and no longer require approval or rejection.');
    }
    if (listing.status !== ListingStatus.PUBLISHED) {
      throw new BadRequestException('Only published listings can be suspended');
    }
    const status = ListingStatus.SUSPENDED;
    const updated = await this.prisma.listing.update({
      where: { id: listingId },
      data: { status, publishedAt: listing.publishedAt, moderatedByUserId: actorId, moderationNote: input.note },
      include: adminListingInclude,
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
