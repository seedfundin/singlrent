import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApplicationStatus, ListingAvailability, NotificationType, Prisma, TenancyStatus } from '@prisma/client';
import { pageResult, Paginated } from '../common/http/pagination';
import { PrismaService } from '../common/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TenancyQuery } from './dto/tenancy.schemas';

const tenancyInclude = {
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
      const saved = await transaction.tenancy.update({ where: { id: tenancy.id }, data: { status: TenancyStatus.ACTIVE }, include: tenancyInclude });
      await transaction.rentalApplication.update({ where: { id: tenancy.applicationId }, data: { status: ApplicationStatus.ACTIVE } });
      return saved;
    });
    await this.notificationsService.create({
      userId: updated.tenantId,
      type: NotificationType.ESCROW_UPDATED,
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
