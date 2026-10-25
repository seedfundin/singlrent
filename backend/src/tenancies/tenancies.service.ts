import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApplicationStatus, ListingAvailability, NotificationType, Prisma, TenancyStatus } from '@prisma/client';
import { pageResult, Paginated } from '../common/http/pagination';
import { PrismaService } from '../common/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TenancyQuery } from './dto/tenancy.schemas';
import { blocksVerification } from '../move-in/move-in.rules';

const tenancyInclude = {
  application: { select: { status: true } },
  moveInVerification: { select: { status: true } },
  listing: { select: { id: true, slug: true, title: true, address: true } },
  tenant: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
  landlord: { select: { id: true, firstName: true, lastName: true } },
  agent: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.TenancyInclude;

type TenancyView = Prisma.TenancyGetPayload<{ include: typeof tenancyInclude }>;

@Injectable()
export class TenanciesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async list(userId: string, query: TenancyQuery): Promise<Paginated<TenancyView>> {
    const where: Prisma.TenancyWhereInput = {
      OR: [{ tenantId: userId }, { landlordId: userId }, { agentId: userId }],
      status: query.status,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.tenancy.findMany({
        where,
        include: tenancyInclude,
        orderBy: { startsAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.tenancy.count({ where }),
    ]);
    return pageResult(items, total, query);
  }

  async activate(managerId: string, tenancyId: string): Promise<TenancyView> {
    const tenancy = await this.findManaged(managerId, tenancyId);
    if (tenancy.status !== TenancyStatus.PENDING_MOVE_IN) {
      throw new ConflictException('Only a pending move-in tenancy can be activated');
    }
    const updated = await this.prisma.$transaction(async (transaction) => {
      const initial = await transaction.moveInVerification.findUnique({ where: { tenancyId }, select: { paymentId: true } });
      if (initial) {
        await transaction.$queryRaw`SELECT id FROM "escrow_records" WHERE "paymentId" = ${initial.paymentId}::uuid FOR UPDATE`;
        const verification = await transaction.moveInVerification.findUniqueOrThrow({ where: { tenancyId }, include: { tenancy: { include: { agreement: true, guarantorForm: true } }, issues: true, refundRequests: { where: { status: 'PENDING' } }, payment: { include: { escrow: true, payouts: true } } } });
        if (verification.status !== 'VERIFIED' || verification.adminHold || verification.issues.some((issue) => blocksVerification({ severity: issue.severity as 'MINOR' | 'MAJOR' | 'CRITICAL', resolved: issue.status === 'RESOLVED', classificationDisputed: issue.classificationDisputed })) || verification.refundRequests.length > 0 || verification.tenancy.agreement?.status !== 'EXECUTED' || verification.tenancy.guarantorForm?.status !== 'EXECUTED' || verification.payment.escrow?.status !== 'HELD' || verification.payment.payouts.some((p) => ['REFUND', 'CAUTION_REFUND'].includes(p.kind) && !['FAILED', 'CANCELLED'].includes(p.status))) {
          throw new ConflictException('Verification, the signed agreement and the completed guarantor form must be recorded, with the payment protected and no refund or dispute, before activation');
        }
      } else if (tenancy.application.status !== ApplicationStatus.APPROVED) {
        throw new ConflictException('Payment release must be authorized before a legacy tenancy can be activated');
      }
      const claimed = await transaction.tenancy.updateMany({ where: { id: tenancy.id, status: TenancyStatus.PENDING_MOVE_IN }, data: { status: TenancyStatus.ACTIVE } });
      if (claimed.count !== 1) throw new ConflictException('Tenancy is no longer pending');
      const saved = await transaction.tenancy.findUniqueOrThrow({ where: { id: tenancy.id }, include: tenancyInclude });
      await transaction.rentalApplication.update({ where: { id: tenancy.applicationId }, data: { status: ApplicationStatus.ACTIVE } });
      await transaction.listing.updateMany({
        where: { id: tenancy.listingId, status: { not: 'ARCHIVED' } },
        data: { availability: ListingAvailability.RENTED },
      });
      return saved;
    });
    await this.notificationsService.create({
      userId: updated.tenantId,
      type: NotificationType.TENANCY_UPDATED,
      title: 'Tenancy is active',
      body: `Your tenancy for ${updated.listing.title} is now active.`,
      data: { tenancyId: updated.id },
    });
    return updated;
  }

  async complete(managerId: string, tenancyId: string): Promise<TenancyView> {
    const tenancy = await this.findManaged(managerId, tenancyId);
    if (tenancy.status !== TenancyStatus.ACTIVE) {
      throw new ConflictException('Only an active tenancy can be completed');
    }
    const updated = await this.prisma.$transaction(async (transaction) => {
      const saved = await transaction.tenancy.update({ where: { id: tenancy.id }, data: { status: TenancyStatus.ENDED }, include: tenancyInclude });
      await transaction.rentalApplication.update({ where: { id: tenancy.applicationId }, data: { status: ApplicationStatus.COMPLETED } });
      await transaction.listing.updateMany({
        where: { id: tenancy.listingId, status: { not: 'ARCHIVED' } },
        data: { availability: ListingAvailability.AVAILABLE },
      });
      return saved;
    });
    const recipients = [updated.tenantId, updated.landlordId, updated.agentId].filter((id): id is string => Boolean(id));
    await Promise.all([...new Set(recipients)].map((userId) => this.notificationsService.create({
      userId,
      type: NotificationType.CAUTION_DISPUTE_UPDATED,
      title: 'Tenancy completed — caution settlement is ready',
      body: 'Review the caution balance: return it to the tenant or propose a documented deduction.',
      data: { tenancyId: updated.id, applicationId: updated.applicationId },
    })));
    return updated;
  }

  private async findManaged(managerId: string, tenancyId: string): Promise<TenancyView> {
    const tenancy = await this.prisma.tenancy.findUnique({ where: { id: tenancyId }, include: tenancyInclude });
    if (!tenancy) {
      throw new NotFoundException('Tenancy not found');
    }
    if (![tenancy.landlordId, tenancy.agentId].includes(managerId)) {
      throw new ForbiddenException('Only the landlord or managing agent can update this tenancy');
    }
    return tenancy;
  }
}
