import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType, Prisma, ReviewStatus, ReviewTargetType, TenancyStatus } from '@prisma/client';
import { pageResult, Paginated } from '../common/http/pagination';
import { PrismaService } from '../common/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminReviewQuery, CreateReviewRequest, ModerateReviewRequest, ReviewQuery } from './dto/review.schemas';

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
    const tenancy = await this.prisma.tenancy.findFirst({ where: { id: input.tenancyId, tenantId: authorId, status: TenancyStatus.ENDED } });
    if (!tenancy) {
      throw new ForbiddenException('Reviews are available to verified tenants after a completed tenancy');
    }
    const targetUserId = input.targetType === ReviewTargetType.LANDLORD
      ? tenancy.landlordId
      : input.targetType === ReviewTargetType.AGENT
        ? tenancy.agentId
        : null;
    if (input.targetType === ReviewTargetType.AGENT && !targetUserId) {
      throw new ConflictException('This tenancy has no managing agent to review');
    }
    const existing = await this.prisma.review.findFirst({
      where: { authorId, listingId: tenancy.listingId, targetType: input.targetType, targetUserId },
    });
    if (existing) {
      throw new ConflictException('You have already reviewed this target for the tenancy');
    }
    const review = await this.prisma.review.create({
      data: { authorId, listingId: tenancy.listingId, targetUserId, targetType: input.targetType, score: input.score, body: input.body },
      include: reviewInclude,
    });
    if (targetUserId) {
      await this.notificationsService.create({
        userId: targetUserId,
        type: NotificationType.LISTING_STATUS_UPDATED,
        title: 'New tenancy review',
        body: 'A completed tenancy review was posted.',
        data: { reviewId: review.id },
      });
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

  async adminList(query: AdminReviewQuery): Promise<Paginated<ReviewView>> {
    return this.listFor({ status: query.status }, query);
  }

  /** Completed tenancies that can still receive a tenant review. */
  async opportunities(authorId: string, query: AdminReviewQuery) {
    const tenancyWhere = { tenantId: authorId, status: TenancyStatus.ENDED } satisfies Prisma.TenancyWhereInput;
    const [tenancies, total] = await this.prisma.$transaction([
      this.prisma.tenancy.findMany({
        where: tenancyWhere,
        include: {
          listing: { select: { id: true, title: true, slug: true } },
          landlord: { select: { id: true, firstName: true, lastName: true } },
          agent: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { endsAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.tenancy.count({ where: tenancyWhere }),
    ]);
    const listingIds = tenancies.map((tenancy) => tenancy.listingId);
    const existing = listingIds.length
      ? await this.prisma.review.findMany({
          where: { authorId, listingId: { in: listingIds } },
          select: { listingId: true, targetType: true, targetUserId: true },
        })
      : [];
    return pageResult(tenancies.map((tenancy) => {
      const reviews = existing.filter((review) => review.listingId === tenancy.listingId);
      return {
        tenancyId: tenancy.id,
        endedAt: tenancy.endsAt,
        listing: tenancy.listing,
        targets: [
          { type: ReviewTargetType.LISTING, user: null, reviewed: reviews.some((review) => review.targetType === ReviewTargetType.LISTING) },
          { type: ReviewTargetType.LANDLORD, user: tenancy.landlord, reviewed: reviews.some((review) => review.targetType === ReviewTargetType.LANDLORD && review.targetUserId === tenancy.landlordId) },
          ...(tenancy.agent ? [{ type: ReviewTargetType.AGENT, user: tenancy.agent, reviewed: reviews.some((review) => review.targetType === ReviewTargetType.AGENT && review.targetUserId === tenancy.agentId) }] : []),
        ],
      };
    }), total, query);
  }

  async moderate(actorId: string, reviewId: string, input: ModerateReviewRequest): Promise<ReviewView> {
    const review = await this.prisma.review.update({
      where: { id: reviewId },
      data: { status: input.status, moderationNote: input.note },
      include: reviewInclude,
    }).catch(() => undefined);
    if (!review) {
      throw new NotFoundException('Review not found');
    }
    return review;
  }

  private async listFor(where: Prisma.ReviewWhereInput, query: AdminReviewQuery): Promise<Paginated<ReviewView>> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.review.findMany({ where, include: reviewInclude, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.review.count({ where }),
    ]);
    return pageResult(items, total, query);
  }
}
