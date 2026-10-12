import { Injectable } from '@nestjs/common';
import { ApplicationStatus, ListingStatus, PaymentStatus, RoleCode, TenancyStatus } from '@prisma/client';
import { PrismaService } from '../common/database/prisma.service';
import { RedisService } from '../common/redis/redis.service';

function normalizeForCache(value: unknown): unknown {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (Array.isArray(value)) {
    return value.map(normalizeForCache);
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, normalizeForCache(item)]));
  }
  return value;
}

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async get(userId: string) {
    const cacheKey = `dashboard:v1:${userId}`;
    const cached = await this.redis.client.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as unknown;
    }
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { userRoles: { select: { role: { select: { code: true } } } } },
    });
    const roles = user.userRoles.map(({ role }) => role.code);
    const base = await this.baseMetrics(userId);
    const result = {
      roles,
      tenant: roles.includes(RoleCode.TENANT) ? await this.tenantMetrics(userId) : undefined,
      landlord: roles.includes(RoleCode.LANDLORD) ? await this.managerMetrics(userId, 'landlord') : undefined,
      agent: roles.includes(RoleCode.AGENT) ? await this.managerMetrics(userId, 'agent') : undefined,
      admin: roles.some((role) => role === RoleCode.ADMIN || role === RoleCode.SUPER_ADMIN) ? await this.adminMetrics() : undefined,
      ...base,
    };
    await this.redis.client.set(cacheKey, JSON.stringify(normalizeForCache(result)), 'EX', 30);
    return result;
  }

  private async baseMetrics(userId: string) {
    const [unreadNotifications, unreadMessages] = await Promise.all([
      this.prisma.notification.count({ where: { userId, readAt: null } }),
      this.prisma.conversationMember.count({ where: { userId, lastReadAt: null } }),
    ]);
    return { unreadNotifications, unreadMessages };
  }

  private async tenantMetrics(userId: string) {
    const [savedHomes, activeTenancies, pendingApplications, maintenanceOpen, payments] = await Promise.all([
      this.prisma.savedListing.count({ where: { userId } }),
      this.prisma.tenancy.count({ where: { tenantId: userId, status: TenancyStatus.ACTIVE } }),
      this.prisma.rentalApplication.count({ where: { tenantId: userId, status: { in: [ApplicationStatus.PENDING, ApplicationStatus.AWAITING_PAYMENT, ApplicationStatus.PAYMENT_HELD] } } }),
      this.prisma.maintenanceRequest.count({ where: { reporterId: userId, status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] } } }),
      this.prisma.payment.aggregate({ where: { tenantId: userId, status: PaymentStatus.SUCCESS }, _sum: { totalAmountKobo: true } }),
    ]);
    return { savedHomes, activeTenancies, pendingApplications, maintenanceOpen, totalPaidKobo: payments._sum.totalAmountKobo ?? 0n };
  }

  private async managerMetrics(userId: string, kind: 'landlord' | 'agent') {
    const propertyWhere = kind === 'landlord' ? { landlordId: userId } : { managingAgentId: userId };
    const applicationWhere = kind === 'landlord' ? { landlordId: userId } : { agentId: userId };
    const tenancyWhere = kind === 'landlord' ? { landlordId: userId } : { agentId: userId };
    const [totalListings, activeListings, activeTenancies, pendingApplications, maintenanceOpen, payoutAmount] = await Promise.all([
      this.prisma.listing.count({ where: propertyWhere }),
      this.prisma.listing.count({ where: { ...propertyWhere, status: ListingStatus.PUBLISHED, availability: 'AVAILABLE' } }),
      this.prisma.tenancy.count({ where: { ...tenancyWhere, status: TenancyStatus.ACTIVE } }),
      this.prisma.rentalApplication.count({ where: { ...applicationWhere, status: ApplicationStatus.PENDING } }),
      this.prisma.maintenanceRequest.count({ where: { ...(kind === 'landlord' ? { landlordId: userId } : { agentId: userId }), status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] } } }),
      this.prisma.payout.aggregate({ where: { recipientUserId: userId, status: 'PAID' }, _sum: { amountKobo: true } }),
    ]);
    return { totalListings, activeListings, activeTenancies, pendingApplications, maintenanceOpen, paidOutKobo: payoutAmount._sum.amountKobo ?? 0n };
  }

  private async adminMetrics() {
    const [users, administrators, listingsPendingReview, payments, maintenanceOpen, platformRevenue, agentCommissions] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.user.count({
        where: { userRoles: { some: { role: { code: { in: [RoleCode.ADMIN, RoleCode.SUPER_ADMIN] } } } } },
      }),
      this.prisma.listing.count({ where: { status: ListingStatus.PENDING_REVIEW } }),
      this.prisma.payment.count({ where: { status: PaymentStatus.SUCCESS } }),
      this.prisma.maintenanceRequest.count({ where: { status: { in: ['OPEN', 'ACKNOWLEDGED', 'IN_PROGRESS'] } } }),
      this.prisma.payment.aggregate({ where: { status: PaymentStatus.SUCCESS }, _sum: { platformFeeKobo: true } }),
      this.prisma.payment.aggregate({ where: { status: PaymentStatus.SUCCESS }, _sum: { agentFeeKobo: true } }),
    ]);
    return {
      users,
      administrators,
      listingsPendingReview,
      successfulPayments: payments,
      maintenanceOpen,
      platformRevenueKobo: platformRevenue._sum.platformFeeKobo ?? 0n,
      agentCommissionsKobo: agentCommissions._sum.agentFeeKobo ?? 0n,
    };
  }
}
