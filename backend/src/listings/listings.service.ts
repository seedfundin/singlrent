import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ListingAvailability, ListingSource, ListingStatus, Prisma, RoleCode } from '@prisma/client';
import { parseKobo } from '../common/finance/money';
import { pageResult, Paginated } from '../common/http/pagination';
import { AuditService } from '../common/database/audit.service';
import { PrismaService } from '../common/database/prisma.service';
import { MediaService } from '../media/media.service';
import { PricingService } from '../financials/pricing.service';
import { PublisherVerificationService } from '../users/publisher-verification.service';
import { CreateListingRequest, ListingQuery, UpdateListingRequest } from './dto/listing.schemas';

const listingInclude = {
  media: { orderBy: [{ mediaType: 'asc' as const }, { position: 'asc' as const }] },
  landlord: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } },
  managingAgent: { select: { id: true, firstName: true, lastName: true, profileImageUrl: true } },
  _count: { select: { savedBy: true, applications: true, maintenanceRequests: true } },
} satisfies Prisma.ListingInclude;

type ListingWithRelations = Prisma.ListingGetPayload<{ include: typeof listingInclude }>;

@Injectable()
export class ListingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mediaService: MediaService,
    private readonly publisherVerificationService: PublisherVerificationService,
    private readonly pricingService: PricingService,
  ) {}

  async search(query: ListingQuery): Promise<Paginated<ListingWithRelations>> {
    const where: Prisma.ListingWhereInput = {
      status: ListingStatus.PUBLISHED,
      availability: query.availability ?? ListingAvailability.AVAILABLE,
      state: query.state ? { equals: query.state, mode: 'insensitive' } : undefined,
      area: query.area ? { contains: query.area, mode: 'insensitive' } : undefined,
      propertyType: query.propertyType,
      bedrooms: query.bedrooms,
      annualRentKobo:
        query.minRentKobo || query.maxRentKobo
          ? {
              gte: query.minRentKobo ? parseKobo(query.minRentKobo, 'minRentKobo') : undefined,
              lte: query.maxRentKobo ? parseKobo(query.maxRentKobo, 'maxRentKobo') : undefined,
            }
          : undefined,
      amenities: query.amenities ? { hasEvery: query.amenities.split(',').map((value) => value.trim()).filter(Boolean) } : undefined,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.listing.findMany({
        where,
        include: listingInclude,
        orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.listing.count({ where }),
    ]);
    return pageResult(items, total, query);
  }

  async getByPublicId(idOrSlug: string, userId?: string): Promise<ListingWithRelations> {
    const listing = await this.prisma.listing.findFirst({
      where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
      include: listingInclude,
    });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    if (listing.status !== ListingStatus.PUBLISHED && !this.canManage(listing, userId)) {
      throw new NotFoundException('Listing not found');
    }
    return listing;
  }

  /**
   * Returns the server-authoritative rental quote for a published listing.
   * It deliberately does not create a payment or reserve the property.
   */
  async publicPricing(idOrSlug: string) {
    const listing = await this.getByPublicId(idOrSlug);
    const pricing = this.pricingService.calculateRental({
      annualRentKobo: listing.annualRentKobo,
      cautionFeeKobo: listing.cautionFeeKobo,
      source: listing.source,
    });
    return { listingId: listing.id, ...pricing };
  }

  async getMine(userId: string, query: ListingQuery): Promise<Paginated<ListingWithRelations>> {
    const where: Prisma.ListingWhereInput = {
      OR: [{ landlordId: userId }, { managingAgentId: userId }, { createdById: userId }],
      status: query.status,
      availability: query.availability,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.listing.findMany({
        where,
        include: listingInclude,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.listing.count({ where }),
    ]);
    return pageResult(items, total, query);
  }

  async getManagedById(userId: string, idOrSlug: string): Promise<ListingWithRelations> {
    const listing = await this.prisma.listing.findFirst({
      where: {
        AND: [
          { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
          { OR: [{ landlordId: userId }, { managingAgentId: userId }, { createdById: userId }] },
        ],
      },
      include: listingInclude,
    });
    if (!listing) {
      // Do not reveal listings a landlord or agent does not manage.
      throw new NotFoundException('Listing not found');
    }
    return listing;
  }

  async create(userId: string, input: CreateListingRequest): Promise<ListingWithRelations> {
    const roleCodes = await this.getRoleCodes(userId);
    const isAgent = roleCodes.includes(RoleCode.AGENT);
    if (!isAgent && !roleCodes.includes(RoleCode.LANDLORD)) {
      throw new ForbiddenException('Only landlords and agents can create listings');
    }
    await this.publisherVerificationService.assertVerifiedForListing(userId);
    const landlordId = isAgent ? input.landlordId : userId;
    if (!landlordId) {
      throw new ForbiddenException('An agent must select the property owner');
    }
    if (isAgent) {
      await this.assertLandlord(landlordId);
    }

    const preparedMedia = input.media ? await this.mediaService.prepareListingMedia(userId, input.media) : [];
    // A new listing is visible immediately, so validate the publication media
    // requirements before it is ever written as public.
    this.mediaService.assertListingMediaRules(preparedMedia);
    const slug = await this.createUniqueSlug(input.title);
    return this.prisma.$transaction(async (transaction) => {
      const listing = await transaction.listing.create({
        data: {
          slug,
          title: input.title,
          description: input.description,
          propertyType: input.propertyType,
          source: isAgent ? ListingSource.AGENT : ListingSource.LANDLORD,
          annualRentKobo: parseKobo(input.annualRentKobo, 'annualRentKobo'),
          serviceChargeKobo: parseKobo(input.serviceChargeKobo, 'serviceChargeKobo'),
          cautionFeeKobo: parseKobo(input.cautionFeeKobo, 'cautionFeeKobo'),
          bedrooms: input.bedrooms,
          bathrooms: input.bathrooms,
          state: input.state,
          area: input.area,
          address: input.address,
          latitude: input.latitude,
          longitude: input.longitude,
          amenities: input.amenities,
          rules: input.rules,
          availableFrom: input.availableFrom ? new Date(input.availableFrom) : undefined,
          minimumLeaseMonths: input.minimumLeaseMonths,
          landlordId,
          createdById: userId,
          managingAgentId: isAgent ? userId : undefined,
          status: ListingStatus.PUBLISHED,
          publishedAt: new Date(),
          media: preparedMedia.length
            ? {
                create: preparedMedia,
              }
            : undefined,
        },
        include: listingInclude,
      });
      await this.audit.record({
        actorUserId: userId,
        action: 'listing.created_and_published',
        entityType: 'listing',
        entityId: listing.id,
        metadata: { status: ListingStatus.PUBLISHED, publication: 'automatic' },
      });
      return listing;
    });
  }

  async update(userId: string, listingId: string, input: UpdateListingRequest): Promise<ListingWithRelations> {
    const listing = await this.findManagedListing(listingId, userId);
    if (listing.status === ListingStatus.ARCHIVED) {
      throw new BadRequestException('Archived listings cannot be edited');
    }
    const preparedMedia = input.media ? await this.mediaService.prepareListingMedia(userId, input.media) : undefined;
    const nextStatus = listing.status === ListingStatus.SUSPENDED ? ListingStatus.SUSPENDED : ListingStatus.PUBLISHED;
    const needsPublicationMediaCheck = nextStatus === ListingStatus.PUBLISHED
      && (listing.status !== ListingStatus.PUBLISHED || Boolean(preparedMedia));
    if (needsPublicationMediaCheck) {
      await this.publisherVerificationService.assertVerifiedForListing(userId);
      const media = preparedMedia ?? await this.prisma.listingMedia.findMany({
        where: { listingId },
        select: { mediaType: true },
      });
      this.mediaService.assertListingMediaRules(media);
    }
    const publishedAt = nextStatus === ListingStatus.PUBLISHED ? listing.publishedAt ?? new Date() : listing.publishedAt;
    const replacedMedia = input.media
      ? await this.prisma.listingMedia.findMany({ where: { listingId }, select: { objectKey: true } })
      : [];
    return this.prisma.$transaction(async (transaction) => {
      if (preparedMedia) {
        await transaction.listingMedia.deleteMany({ where: { listingId } });
      }
      const updated = await transaction.listing.update({
        where: { id: listing.id },
        data: {
          ...this.mapInput(input),
          // Verified publishers' edits remain public. A suspension is a safety
          // action and is deliberately not overturned by an owner edit.
          status: nextStatus,
          publishedAt,
          moderatedByUserId: nextStatus === ListingStatus.PUBLISHED ? null : listing.moderatedByUserId,
          moderationNote: nextStatus === ListingStatus.PUBLISHED ? null : listing.moderationNote,
          media: preparedMedia
            ? { create: preparedMedia }
            : undefined,
        },
        include: listingInclude,
      });
      await this.audit.record({
        actorUserId: userId,
        action: 'listing.updated',
        entityType: 'listing',
        entityId: listing.id,
        metadata: { previousStatus: listing.status, status: nextStatus, publication: 'automatic' },
      });
      return updated;
    }).then(async (updated) => {
      const retained = new Set(preparedMedia?.map((item) => item.objectKey) ?? []);
      await Promise.all(replacedMedia
        .filter((item) => !retained.has(item.objectKey))
        .map((item) => this.mediaService.deleteListingObject(userId, item.objectKey)));
      return updated;
    });
  }

  async publish(userId: string, listingId: string): Promise<ListingWithRelations> {
    const listing = await this.findManagedListing(listingId, userId);
    await this.publisherVerificationService.assertVerifiedForListing(userId);
    if (
      listing.status !== ListingStatus.DRAFT
      && listing.status !== ListingStatus.REJECTED
      && listing.status !== ListingStatus.PENDING_REVIEW
    ) {
      throw new BadRequestException('Only a draft, rejected, or pending listing can be published');
    }
    const media = await this.prisma.listingMedia.findMany({
      where: { listingId },
      select: { mediaType: true },
    });
    this.mediaService.assertListingMediaRules(media);
    const updated = await this.prisma.listing.update({
      where: { id: listing.id },
      data: {
        status: ListingStatus.PUBLISHED,
        publishedAt: listing.publishedAt ?? new Date(),
        moderatedByUserId: null,
        moderationNote: null,
      },
      include: listingInclude,
    });
    await this.audit.record({
      actorUserId: userId,
      action: 'listing.published',
      entityType: 'listing',
      entityId: listing.id,
      metadata: { publication: 'automatic' },
    });
    return updated;
  }

  async archive(userId: string, listingId: string): Promise<void> {
    const listing = await this.findManagedListing(listingId, userId);
    await this.prisma.listing.update({
      where: { id: listing.id },
      data: { status: ListingStatus.ARCHIVED, archivedAt: new Date(), availability: ListingAvailability.UNAVAILABLE },
    });
    await this.audit.record({ actorUserId: userId, action: 'listing.archived', entityType: 'listing', entityId: listing.id });
  }

  async removeMedia(userId: string, listingId: string, mediaId: string): Promise<void> {
    const listing = await this.findManagedListing(listingId, userId);
    const media = await this.prisma.listingMedia.findFirst({
      where: { id: mediaId, listingId },
      select: { id: true, objectKey: true },
    });
    if (!media) throw new NotFoundException('Listing media was not found');
    if (listing.status === ListingStatus.PUBLISHED) {
      const remainingMedia = await this.prisma.listingMedia.findMany({
        where: { listingId, id: { not: media.id } },
        select: { mediaType: true },
      });
      this.mediaService.assertListingMediaRules(remainingMedia);
    }
    await this.prisma.listingMedia.delete({ where: { id: media.id } });
    await this.mediaService.deleteListingObject(userId, media.objectKey);
    await this.audit.record({
      actorUserId: userId,
      action: 'listing.media_removed',
      entityType: 'listing',
      entityId: listingId,
      metadata: { mediaId },
    });
  }

  async save(userId: string, listingId: string): Promise<void> {
    const listing = await this.prisma.listing.findFirst({ where: { id: listingId, status: ListingStatus.PUBLISHED } });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    await this.prisma.savedListing.upsert({
      where: { userId_listingId: { userId, listingId } },
      create: { userId, listingId },
      update: {},
    });
  }

  async unsave(userId: string, listingId: string): Promise<void> {
    await this.prisma.savedListing.deleteMany({ where: { userId, listingId } });
  }

  async saved(userId: string, query: ListingQuery): Promise<Paginated<ListingWithRelations>> {
    const where: Prisma.ListingWhereInput = { savedBy: { some: { userId } } };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.listing.findMany({
        where,
        include: listingInclude,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.listing.count({ where }),
    ]);
    return pageResult(items, total, query);
  }

  private async findManagedListing(listingId: string, userId: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id: listingId } });
    if (!listing) {
      throw new NotFoundException('Listing not found');
    }
    if (!this.canManage(listing, userId)) {
      throw new ForbiddenException('You do not manage this listing');
    }
    return listing;
  }

  private canManage(listing: { landlordId: string; createdById: string; managingAgentId: string | null }, userId?: string): boolean {
    return Boolean(userId && [listing.landlordId, listing.createdById, listing.managingAgentId].includes(userId));
  }

  private async getRoleCodes(userId: string): Promise<RoleCode[]> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { userRoles: { select: { role: { select: { code: true } } } } },
    });
    return user?.userRoles.map(({ role }) => role.code) ?? [];
  }

  private async assertLandlord(userId: string): Promise<void> {
    const landlord = await this.prisma.user.findFirst({
      where: { id: userId, userRoles: { some: { role: { code: RoleCode.LANDLORD } } } },
      select: { id: true },
    });
    if (!landlord) {
      throw new NotFoundException('Landlord account not found');
    }
  }

  private async createUniqueSlug(title: string): Promise<string> {
    const base = title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')
      .slice(0, 145) || 'home';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const slug = `${base}-${Math.random().toString(36).slice(2, 9)}`;
      const exists = await this.prisma.listing.findUnique({ where: { slug }, select: { id: true } });
      if (!exists) {
        return slug;
      }
    }
    throw new ForbiddenException('Unable to create a unique listing identifier');
  }

  private mapInput(input: UpdateListingRequest): Prisma.ListingUpdateInput {
    return {
      title: input.title,
      description: input.description,
      propertyType: input.propertyType,
      annualRentKobo: input.annualRentKobo ? parseKobo(input.annualRentKobo, 'annualRentKobo') : undefined,
      serviceChargeKobo: input.serviceChargeKobo ? parseKobo(input.serviceChargeKobo, 'serviceChargeKobo') : undefined,
      cautionFeeKobo: input.cautionFeeKobo ? parseKobo(input.cautionFeeKobo, 'cautionFeeKobo') : undefined,
      bedrooms: input.bedrooms,
      bathrooms: input.bathrooms,
      state: input.state,
      area: input.area,
      address: input.address,
      latitude: input.latitude,
      longitude: input.longitude,
      amenities: input.amenities,
      rules: input.rules,
      availableFrom: input.availableFrom ? new Date(input.availableFrom) : undefined,
      minimumLeaseMonths: input.minimumLeaseMonths,
    };
  }
}
