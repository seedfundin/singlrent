import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApplicationStatus, NotificationType, Prisma, ReviewStatus, ReviewTargetType, TenancyStatus } from '@prisma/client';
import { pageResult, Paginated } from '../common/http/pagination';
import { PrismaService } from '../common/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminReviewQuery, CreateReviewRequest, DisputeReviewRequest, ModerateReviewRequest, ReviewQuery, TenantReviewRecordQuery } from './dto/review.schemas';

const tenantInspectionDimensionKeys = ['attendance', 'punctuality', 'communication'];
const tenantTenancyDimensionKeys = ['paymentReliability', 'propertyCare', 'communication', 'tenancyObligations'];

const reviewInclude = {
  author: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } },
  listing: { select: { id: true, title: true, slug: true } },
  targetUser: { select: { id: true, firstName: true, lastName: true } },
} satisfies Prisma.ReviewInclude;

type ReviewView = Prisma.ReviewGetPayload<{ include: typeof reviewInclude }>;

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(authorId: string, input: CreateReviewRequest): Promise<ReviewView> {
    if (Boolean(input.tenancyId) === Boolean(input.inspectionId)) throw new ConflictException('Provide exactly one tenancy or inspection');
    const review = await this.prisma.$transaction(async (tx) => {
      let listingId: string;
      let targetUserId: string | null;
      if (input.inspectionId) {
        const initial = await tx.inspectionBooking.findUnique({ where: { id: input.inspectionId } });
        if (!initial) throw new ForbiddenException('Inspection is not eligible for review');
        for (const key of [`inspection:host:${initial.hostId}`, `inspection:listing:${initial.listingId}`].sort()) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
        const inspection = await tx.inspectionBooking.findUniqueOrThrow({ where: { id: initial.id } });
        if (inspection.status !== 'COMPLETED' || !inspection.hostCompletedAt || !inspection.tenantConfirmedAt || inspection.tenantDisputedAt || !inspection.landlordId) throw new ForbiddenException('Reviews require an undisputed inspection confirmed by both parties');
        listingId = inspection.listingId;
        targetUserId = this.targetFor(authorId, { tenantId: inspection.tenantId, landlordId: inspection.landlordId, agentId: inspection.agentId }, input.targetType);
      } else {
        const key = `review:tenancy:${input.tenancyId}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
        const tenancy = await tx.tenancy.findFirst({ where: { id: input.tenancyId, status: TenancyStatus.ENDED } });
        if (!tenancy) throw new ForbiddenException('Reviews are available only after a completed tenancy');
        listingId = tenancy.listingId;
        targetUserId = this.targetFor(authorId, tenancy, input.targetType);
      }
      if (targetUserId === authorId) throw new ForbiddenException('You cannot review yourself');
      if (input.targetType === ReviewTargetType.TENANT && input.ratingDimensions) {
        const allowed = input.inspectionId ? tenantInspectionDimensionKeys : tenantTenancyDimensionKeys;
        if (Object.keys(input.ratingDimensions).some((key) => !allowed.includes(key))) {
          throw new ConflictException(input.inspectionId
            ? 'Inspection feedback about a tenant may cover attendance, punctuality, and communication only'
            : 'Tenancy feedback about a tenant must use the tenant rental record categories');
        }
      }
      const existing = await tx.review.findFirst({ where: { tenancyId: input.tenancyId, inspectionId: input.inspectionId, authorId, targetType: input.targetType } });
      if (existing) throw new ConflictException('You have already reviewed this subject for this interaction');
      return tx.review.create({ data: { tenancyId: input.tenancyId, inspectionId: input.inspectionId, authorId, listingId, targetUserId, targetType: input.targetType, score: input.score, body: input.body, ratingDimensions: input.ratingDimensions }, include: reviewInclude });
    });
    if (review.targetUserId) {
      try {
        await this.notificationsService.create({ userId: review.targetUserId, type: NotificationType.REVIEW_UPDATED, title: 'New verified review', body: 'A review was posted for a verified interaction.', data: { reviewId: review.id } });
      } catch { /* A delivery problem must not undo an already recorded review. */ }
    } else if (review.targetType === ReviewTargetType.LISTING) {
      try {
        const interaction = review.inspectionId
          ? await this.prisma.inspectionBooking.findUnique({ where: { id: review.inspectionId }, select: { landlordId: true, agentId: true } })
          : await this.prisma.tenancy.findUnique({ where: { id: review.tenancyId! }, select: { landlordId: true, agentId: true } });
        const recipients = [...new Set([interaction?.landlordId, interaction?.agentId].filter((id): id is string => Boolean(id) && id !== authorId))];
        await Promise.allSettled(recipients.map((userId) => this.notificationsService.create({ userId, type: NotificationType.REVIEW_UPDATED, title: 'New property review', body: 'A review was posted for a verified property interaction.', data: { reviewId: review.id } })));
      } catch { /* The review is already recorded. */ }
    }
    return review;
  }

  async list(query: ReviewQuery): Promise<Paginated<ReviewView>> {
    if (!query.listingId && !query.targetUserId) {
      throw new ConflictException('Provide a listing or review target');
    }
    const where: Prisma.ReviewWhereInput = {
      status: ReviewStatus.PUBLISHED,
      listingId: query.listingId,
      targetUserId: query.targetUserId,
      targetType: query.targetType ?? { in: [ReviewTargetType.LISTING, ReviewTargetType.LANDLORD, ReviewTargetType.AGENT] },
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({ where, include: reviewInclude, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.review.count({ where }),
    ]);
    return pageResult(items, total, query);
  }

  async mine(authorId: string, query: AdminReviewQuery): Promise<Paginated<ReviewView>> {
    return this.listFor({ authorId }, query);
  }

  async received(userId: string, query: AdminReviewQuery): Promise<Paginated<ReviewView>> {
    return this.listFor({ targetUserId: userId }, query);
  }

  async inspectionOpportunities(authorId: string) {
    const bookings = await this.prisma.inspectionBooking.findMany({
      where: { status: 'COMPLETED', hostCompletedAt: { not: null }, tenantConfirmedAt: { not: null }, tenantDisputedAt: null, landlordId: { not: null }, OR: [{ tenantId: authorId }, { landlordId: authorId }, { agentId: authorId }] },
      orderBy: { startsAt: 'desc' }, take: 200,
    });
    const existing = await this.prisma.review.findMany({ where: { authorId, inspectionId: { in: bookings.map((b) => b.id) } }, select: { inspectionId: true, targetType: true } });
    return bookings.map((booking) => {
      const types: ReviewTargetType[] = booking.tenantId === authorId
        ? [ReviewTargetType.LISTING, ReviewTargetType.LANDLORD, ...(booking.agentId && booking.agentId !== authorId ? [ReviewTargetType.AGENT] : [])]
        : [ReviewTargetType.TENANT];
      return { inspectionId: booking.id, targets: types.filter((type) => !existing.some((review) => review.inspectionId === booking.id && review.targetType === type)) };
    });
  }

  /**
   * A tenant record is intentionally tied to an active application. It is not
   * a directory lookup: only the landlord or agent who is evaluating that
   * application can read it, and inspection feedback never affects the
   * completed-tenancy summary.
   */
  async tenantRecord(managerId: string, applicationId: string, query: TenantReviewRecordQuery) {
    const application = await this.prisma.rentalApplication.findFirst({
      where: {
        id: applicationId,
        status: { in: [ApplicationStatus.PENDING, ApplicationStatus.AWAITING_PAYMENT] },
        OR: [{ landlordId: managerId }, { agentId: managerId }],
      },
      select: { tenant: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!application) throw new ForbiddenException('This private tenant record is available only while you are handling the application');

    const where = {
      targetUserId: application.tenant.id,
      targetType: ReviewTargetType.TENANT,
      status: ReviewStatus.PUBLISHED,
      ...(query.source === 'TENANCY' ? { tenancyId: { not: null } } : { inspectionId: { not: null } }),
    } satisfies Prisma.ReviewWhereInput;
    const [items, total, aggregate, dimensionRows] = await this.prisma.$transaction([
      this.prisma.review.findMany({ where, include: reviewInclude, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.review.count({ where }),
      this.prisma.review.aggregate({ where, _avg: { score: true }, _count: { id: true } }),
      this.prisma.review.findMany({ where, select: { ratingDimensions: true } }),
    ]);
    return {
      tenant: application.tenant,
      source: query.source,
      summary: this.reviewSummary(aggregate, dimensionRows),
      reviews: pageResult(items, total, query),
    };
  }

  async adminList(query: AdminReviewQuery): Promise<Paginated<ReviewView>> {
    return this.listFor({ status: query.status }, query);
  }

  /** Completed tenancies that can still receive a tenant review. */
  async opportunities(authorId: string, query: AdminReviewQuery) {
    const tenancyWhere = {
      status: TenancyStatus.ENDED,
      OR: [{ tenantId: authorId }, { landlordId: authorId }, { agentId: authorId }],
    } satisfies Prisma.TenancyWhereInput;
    const [tenancies, total] = await this.prisma.$transaction([
      this.prisma.tenancy.findMany({
        where: tenancyWhere,
        include: {
          listing: { select: { id: true, title: true, slug: true } },
          tenant: { select: { id: true, firstName: true, lastName: true } },
          landlord: { select: { id: true, firstName: true, lastName: true } },
          agent: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { endsAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.tenancy.count({ where: tenancyWhere }),
    ]);
    const tenancyIds = tenancies.map((tenancy) => tenancy.id);
    const existing = tenancyIds.length
      ? await this.prisma.review.findMany({
          where: { authorId, tenancyId: { in: tenancyIds } },
          select: { tenancyId: true, targetType: true, targetUserId: true },
        })
      : [];
    return pageResult(tenancies.map((tenancy) => {
      const reviews = existing.filter((review) => review.tenancyId === tenancy.id);
      const tenantIsAuthor = tenancy.tenantId === authorId;
      const targets = tenantIsAuthor
        ? [
            { type: ReviewTargetType.LISTING, user: null, reviewed: reviews.some((review) => review.targetType === ReviewTargetType.LISTING) },
            { type: ReviewTargetType.LANDLORD, user: tenancy.landlord, reviewed: reviews.some((review) => review.targetType === ReviewTargetType.LANDLORD && review.targetUserId === tenancy.landlordId) },
            ...(tenancy.agent ? [{ type: ReviewTargetType.AGENT, user: tenancy.agent, reviewed: reviews.some((review) => review.targetType === ReviewTargetType.AGENT && review.targetUserId === tenancy.agentId) }] : []),
          ]
        : [{ type: ReviewTargetType.TENANT, user: tenancy.tenant, reviewed: reviews.some((review) => review.targetType === ReviewTargetType.TENANT && review.targetUserId === tenancy.tenantId) }];
      return {
        tenancyId: tenancy.id,
        endedAt: tenancy.endsAt,
        listing: tenancy.listing,
        targets,
      };
    }), total, query);
  }

  async moderate(actorId: string, reviewId: string, input: ModerateReviewRequest): Promise<ReviewView> {
    const review = await this.prisma.review.update({
      where: { id: reviewId },
      data: {
        status: input.status,
        moderationNote: input.note,
        moderatedByUserId: actorId,
        moderatedAt: new Date(),
        disputeResolvedAt: new Date(),
      },
      include: reviewInclude,
    }).catch(() => undefined);
    if (!review) {
      throw new NotFoundException('Review not found');
    }
    return review;
  }

  async dispute(userId: string, reviewId: string, input: DisputeReviewRequest): Promise<ReviewView> {
    const review = await this.prisma.review.findFirst({ where: { id: reviewId, targetUserId: userId }, include: reviewInclude });
    if (!review) throw new ForbiddenException('Only the reviewed account can dispute this review');
    if (review.status === ReviewStatus.REMOVED) throw new ConflictException('A removed review cannot be disputed');
    if (review.disputedAt && !review.disputeResolvedAt) throw new ConflictException('This review dispute is already awaiting moderation');
    const updated = await this.prisma.review.update({
      where: { id: review.id },
      data: { disputedAt: new Date(), disputeReason: input.reason, disputeResolvedAt: null, reportedAt: new Date() },
      include: reviewInclude,
    });
    return updated;
  }

  async summary(query: Pick<ReviewQuery, 'listingId' | 'targetUserId' | 'targetType'>) {
    if (!query.listingId && !query.targetUserId) throw new ConflictException('Provide a listing or review target');
    const where = {
      status: ReviewStatus.PUBLISHED,
      listingId: query.listingId,
      targetUserId: query.targetUserId,
      targetType: query.targetType ?? { in: [ReviewTargetType.LISTING, ReviewTargetType.LANDLORD, ReviewTargetType.AGENT] },
    } satisfies Prisma.ReviewWhereInput;
    const [aggregate, dimensionRows] = await this.prisma.$transaction([
      this.prisma.review.aggregate({ where, _avg: { score: true }, _count: { id: true } }),
      this.prisma.review.findMany({ where, select: { ratingDimensions: true } }),
    ]);
    return this.reviewSummary(aggregate, dimensionRows);
  }

  private reviewSummary(
    aggregate: { _count: { id: number }; _avg: { score: number | null } },
    dimensionRows: Array<{ ratingDimensions: Prisma.JsonValue | null }>,
  ) {
    const dimensions: Record<string, { total: number; count: number; average: number }> = {};
    for (const row of dimensionRows) {
      if (!row.ratingDimensions || typeof row.ratingDimensions !== 'object' || Array.isArray(row.ratingDimensions)) continue;
      for (const [name, value] of Object.entries(row.ratingDimensions)) {
        if (typeof value !== 'number') continue;
        const current = dimensions[name] ?? { total: 0, count: 0, average: 0 };
        current.total += value;
        current.count += 1;
        current.average = Number((current.total / current.count).toFixed(2));
        dimensions[name] = current;
      }
    }
    return {
      count: aggregate._count.id,
      averageScore: aggregate._avg.score === null ? null : Number(aggregate._avg.score.toFixed(2)),
      dimensions: Object.fromEntries(Object.entries(dimensions).map(([name, value]) => [name, { average: value.average, count: value.count }])),
    };
  }

  private targetFor(
    authorId: string,
    tenancy: Pick<Prisma.TenancyGetPayload<Record<string, never>>, 'tenantId' | 'landlordId' | 'agentId'>,
    targetType: ReviewTargetType,
  ): string | null {
    if (tenancy.tenantId === authorId) {
      if (targetType === ReviewTargetType.LISTING) return null;
      if (targetType === ReviewTargetType.LANDLORD) return tenancy.landlordId;
      if (targetType === ReviewTargetType.AGENT && tenancy.agentId) return tenancy.agentId;
      throw new ConflictException('This tenancy has no managing agent to review');
    }
    if ((tenancy.landlordId === authorId || tenancy.agentId === authorId) && targetType === ReviewTargetType.TENANT) {
      return tenancy.tenantId;
    }
    throw new ForbiddenException('Only a tenancy tenant can review the property or manager; only its landlord or agent can review the tenant');
  }

  private async listFor(where: Prisma.ReviewWhereInput, query: AdminReviewQuery): Promise<Paginated<ReviewView>> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({ where, include: reviewInclude, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.review.count({ where }),
    ]);
    return pageResult(items, total, query);
  }
}
