import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ApplicationStatus, ListingAvailability, ListingStatus, NotificationType, Prisma } from '@prisma/client';
import { AuditService } from '../common/database/audit.service';
import { pageResult, Paginated } from '../common/http/pagination';
import { PrismaService } from '../common/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ApplicationQuery, CreateApplicationRequest, RejectApplicationRequest, UpdateApplicationRequest } from './dto/application.schemas';

const applicationInclude = {
  listing: { select: { id: true, slug: true, title: true, annualRentKobo: true, cautionFeeKobo: true } },
  tenant: { select: { id: true, firstName: true, lastName: true } },
  landlord: { select: { id: true, firstName: true, lastName: true } },
  agent: { select: { id: true, firstName: true, lastName: true } },
  payments: { select: { id: true, reference: true, status: true, totalAmountKobo: true, createdAt: true }, orderBy: { createdAt: 'desc' as const } },
} satisfies Prisma.RentalApplicationInclude;

type ApplicationView = Prisma.RentalApplicationGetPayload<{ include: typeof applicationInclude }>;
const cancellableStatuses: ApplicationStatus[] = [ApplicationStatus.PENDING, ApplicationStatus.AWAITING_PAYMENT];

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(tenantId: string, input: CreateApplicationRequest): Promise<ApplicationView> {
    if (input.messageToLandlord?.trim()) throw new ForbiddenException('Use the Property Assistant for property questions.');
    const listing = await this.prisma.listing.findFirst({
      where: { id: input.listingId, status: ListingStatus.PUBLISHED, availability: ListingAvailability.AVAILABLE },
    });
    if (!listing) {
      throw new NotFoundException('This listing is not available for applications');
    }
    if (listing.landlordId === tenantId || listing.managingAgentId === tenantId) {
      throw new ForbiddenException('You cannot apply to a listing you manage');
    }
    const existing = await this.prisma.rentalApplication.findFirst({
      where: {
        listingId: listing.id,
        tenantId,
        status: { in: [ApplicationStatus.PENDING, ApplicationStatus.AWAITING_PAYMENT, ApplicationStatus.PAYMENT_HELD, ApplicationStatus.APPROVED, ApplicationStatus.ACTIVE] },
      },
    });
    if (existing) {
      throw new ConflictException('You already have an active application for this listing');
    }
    const application = await this.prisma.rentalApplication.create({
      data: {
        listingId: listing.id,
        tenantId,
        landlordId: listing.landlordId,
        agentId: listing.managingAgentId,
        moveInDate: new Date(input.moveInDate),
        leaseMonths: input.leaseMonths,
        occupation: input.occupation,
        occupantsCount: input.occupantsCount,
        messageToLandlord: input.messageToLandlord,
        tenantQuestionnaire: input.tenantQuestionnaire,
        questionnaireSubmittedAt: new Date(),
      },
      include: applicationInclude,
    });
    await this.audit.record({ actorUserId: tenantId, action: 'application.created', entityType: 'rental_application', entityId: application.id });
    const recipients = [application.landlordId, application.agentId].filter((id): id is string => Boolean(id));
    await Promise.all(
      recipients.map((userId) =>
        this.notificationsService.create({
          userId,
          type: NotificationType.NEW_APPLICATION,
          title: 'New rental application',
          body: `${application.tenant.firstName} applied for ${application.listing.title}.`,
          data: { applicationId: application.id, listingId: application.listingId },
        }),
      ),
    );
    return application;
  }

  async mine(tenantId: string, query: ApplicationQuery): Promise<Paginated<ApplicationView>> {
    return this.list({ tenantId }, query);
  }

  async received(managerId: string, query: ApplicationQuery): Promise<Paginated<ApplicationView>> {
    return this.list({ OR: [{ landlordId: managerId }, { agentId: managerId }] }, query);
  }

  /** Tenants can correct their own pre-decision application. Managers retain the
   * immutable submitted snapshot once a payment decision has been made. */
  async updatePending(tenantId: string, applicationId: string, input: UpdateApplicationRequest): Promise<ApplicationView> {
    if (input.messageToLandlord?.trim()) throw new ForbiddenException('Use the Property Assistant for property questions.');
    const application = await this.prisma.rentalApplication.findFirst({ where: { id: applicationId, tenantId }, select: { id: true, status: true } });
    if (!application) throw new NotFoundException('Application not found');
    if (application.status !== ApplicationStatus.PENDING) {
      throw new ConflictException('Only an application awaiting a manager decision can be updated');
    }
    const updated = await this.prisma.rentalApplication.update({
      where: { id: application.id },
      data: {
        moveInDate: new Date(input.moveInDate),
        leaseMonths: input.leaseMonths,
        occupation: input.occupation,
        occupantsCount: input.occupantsCount,
        tenantQuestionnaire: input.tenantQuestionnaire,
        questionnaireSubmittedAt: new Date(),
      },
      include: applicationInclude,
    });
    await this.audit.record({ actorUserId: tenantId, action: 'application.updated_before_decision', entityType: 'rental_application', entityId: updated.id });
    return updated;
  }

  async approveForPayment(managerId: string, applicationId: string): Promise<ApplicationView> {
    const application = await this.findManagedApplication(managerId, applicationId);
    if (application.status !== ApplicationStatus.PENDING) {
      throw new ConflictException('Only pending applications can be approved for payment');
    }
    const updated = await this.prisma.rentalApplication.update({
      where: { id: application.id },
      data: { status: ApplicationStatus.AWAITING_PAYMENT, decidedAt: new Date(), decisionReason: null },
      include: applicationInclude,
    });
    await this.notificationsService.create({
      userId: updated.tenantId,
      type: NotificationType.APPLICATION_APPROVED,
      title: 'Application approved — payment required',
      body: `Your application for ${updated.listing.title} was accepted. Complete payment to reserve the home.`,
      data: { applicationId: updated.id },
    });
    return updated;
  }

  async reject(managerId: string, applicationId: string, input: RejectApplicationRequest): Promise<ApplicationView> {
    const application = await this.findManagedApplication(managerId, applicationId);
    if (!cancellableStatuses.includes(application.status)) {
      throw new ConflictException('This application can no longer be rejected');
    }
    const updated = await this.prisma.rentalApplication.update({
      where: { id: application.id },
      data: { status: ApplicationStatus.REJECTED, decisionReason: input.reason, decidedAt: new Date() },
      include: applicationInclude,
    });
    await this.notificationsService.create({
      userId: updated.tenantId,
      type: NotificationType.APPLICATION_REJECTED,
      title: 'Application not approved',
      body: `Your application for ${updated.listing.title} was not approved.`,
      data: { applicationId: updated.id },
    });
    return updated;
  }

  async cancel(tenantId: string, applicationId: string): Promise<void> {
    const application = await this.prisma.rentalApplication.findFirst({ where: { id: applicationId, tenantId } });
    if (!application) {
      throw new NotFoundException('Application not found');
    }
    if (!cancellableStatuses.includes(application.status)) {
      throw new ConflictException('This application cannot be cancelled after payment is held');
    }
    await this.prisma.rentalApplication.update({ where: { id: application.id }, data: { status: ApplicationStatus.CANCELLED } });
  }

  private async list(where: Prisma.RentalApplicationWhereInput, query: ApplicationQuery): Promise<Paginated<ApplicationView>> {
    const completeWhere = { ...where, status: query.status };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.rentalApplication.findMany({
        where: completeWhere,
        include: applicationInclude,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.rentalApplication.count({ where: completeWhere }),
    ]);
    return pageResult(items, total, query);
  }

  private async findManagedApplication(managerId: string, applicationId: string) {
    const application = await this.prisma.rentalApplication.findUnique({ where: { id: applicationId }, include: applicationInclude });
    if (!application) {
      throw new NotFoundException('Application not found');
    }
    if (![application.landlordId, application.agentId].includes(managerId)) {
      throw new ForbiddenException('You do not manage this application');
    }
    return application;
  }
}
