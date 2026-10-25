import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MaintenanceStatus, NotificationType, Prisma, TenancyStatus } from '@prisma/client';
import { pageResult, Paginated } from '../common/http/pagination';
import { PrismaService } from '../common/database/prisma.service';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';
import { RealtimeGateway } from '../websocket/realtime.gateway';
import { CreateMaintenanceRequest, MaintenanceQuery, UpdateMaintenanceRequest } from './dto/maintenance.schemas';

const maintenanceInclude = {
  listing: { select: { id: true, slug: true, title: true } },
  reporter: { select: { id: true, firstName: true, lastName: true } },
  landlord: { select: { id: true, firstName: true, lastName: true } },
  agent: { select: { id: true, firstName: true, lastName: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  attachments: true,
  updates: { include: { author: { select: { id: true, firstName: true, lastName: true } } }, orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.MaintenanceRequestInclude;

type MaintenanceView = Prisma.MaintenanceRequestGetPayload<{ include: typeof maintenanceInclude }>;

const allowedTransitions: Record<MaintenanceStatus, MaintenanceStatus[]> = {
  OPEN: [MaintenanceStatus.ACKNOWLEDGED, MaintenanceStatus.CLOSED],
  ACKNOWLEDGED: [MaintenanceStatus.IN_PROGRESS, MaintenanceStatus.CLOSED],
  IN_PROGRESS: [MaintenanceStatus.RESOLVED],
  RESOLVED: [MaintenanceStatus.IN_PROGRESS, MaintenanceStatus.CLOSED],
  CLOSED: [],
};

@Injectable()
export class MaintenanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
    private readonly notificationsService: NotificationsService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  async create(reporterId: string, input: CreateMaintenanceRequest): Promise<MaintenanceView> {
    const tenancy = await this.prisma.tenancy.findFirst({
      where: { listingId: input.listingId, tenantId: reporterId, status: TenancyStatus.ACTIVE },
      include: { listing: true },
    });
    if (!tenancy) {
      throw new ForbiddenException('Maintenance requests require an active tenancy for this home');
    }
    for (const attachment of input.attachments) {
      this.mediaService.assertOwnedObjectKey(attachment.publicId, reporterId, 'maintenance');
    }
    const request = await this.prisma.maintenanceRequest.create({
      data: {
        listingId: tenancy.listingId,
        tenancyId: tenancy.id,
        reporterId,
        landlordId: tenancy.landlordId,
        agentId: tenancy.agentId,
        title: input.title,
        category: input.category,
        description: input.description,
        priority: input.priority,
        attachments: { create: input.attachments },
      },
      include: maintenanceInclude,
    });
    const recipients = [request.landlordId, request.agentId].filter((id): id is string => Boolean(id));
    recipients.forEach((userId) => this.realtimeGateway.joinUserToProperty(userId, request.listingId));
    this.realtimeGateway.joinUserToProperty(reporterId, request.listingId);
    await Promise.all(
      recipients.map((userId) =>
        this.notificationsService.create({
          userId,
          type: NotificationType.MAINTENANCE_CREATED,
          title: 'New maintenance request',
          body: `${request.reporter.firstName} reported “${request.title}” for ${request.listing.title}.`,
          data: { maintenanceRequestId: request.id, listingId: request.listingId },
        }),
      ),
    );
    return request;
  }

  async list(userId: string, query: MaintenanceQuery): Promise<Paginated<MaintenanceView>> {
    const where: Prisma.MaintenanceRequestWhereInput = {
      OR: [{ reporterId: userId }, { landlordId: userId }, { agentId: userId }, { assignedToId: userId }],
      listingId: query.listingId,
      status: query.status,
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.maintenanceRequest.findMany({
        where,
        include: maintenanceInclude,
        orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.maintenanceRequest.count({ where }),
    ]);
    return pageResult(items, total, query);
  }

  async get(userId: string, requestId: string): Promise<MaintenanceView> {
    const request = await this.findAccessible(userId, requestId);
    this.realtimeGateway.joinUserToProperty(userId, request.listingId);
    return request;
  }

  async update(userId: string, requestId: string, input: UpdateMaintenanceRequest): Promise<MaintenanceView> {
    const request = await this.findAccessible(userId, requestId);
    const isManager = [request.landlordId, request.agentId, request.assignedToId].includes(userId);
    const automaticStatusText = input.status ? `Status changed to ${input.status.toLowerCase().replace('_', ' ')}.` : null;
    if (input.body && input.body !== automaticStatusText) {
      throw new ForbiddenException('Direct maintenance messages are disabled. Use the Property Assistant for questions.');
    }
    if ((input.status !== undefined || input.assignedToId !== undefined) && !isManager) {
      throw new ForbiddenException('Only the landlord, managing agent, or assignee can update maintenance status');
    }
    if (input.status && !allowedTransitions[request.status].includes(input.status)) {
      throw new ConflictException(`Cannot transition maintenance from ${request.status} to ${input.status}`);
    }
    if (!input.body && !input.status && input.assignedToId === undefined) {
      throw new ConflictException('Provide an update, status, or assignee');
    }
    const now = new Date();
    const updated = await this.prisma.$transaction(async (transaction) => {
      const saved = await transaction.maintenanceRequest.update({
        where: { id: request.id },
        data: {
          status: input.status,
          assignedToId: input.assignedToId,
          resolvedAt: input.status === MaintenanceStatus.RESOLVED ? now : undefined,
          closedAt: input.status === MaintenanceStatus.CLOSED ? now : undefined,
        },
        include: maintenanceInclude,
      });
      await transaction.maintenanceUpdate.create({
        data: {
          maintenanceRequestId: request.id,
          authorId: userId,
          body: input.body,
          fromStatus: input.status ? request.status : undefined,
          toStatus: input.status,
        },
      });
      return saved;
    });
    this.realtimeGateway.emitMaintenanceUpdate(updated.listingId, { maintenanceRequestId: updated.id, status: updated.status });
    const recipients = [updated.reporterId, updated.landlordId, updated.agentId, updated.assignedToId]
      .filter((id): id is string => Boolean(id && id !== userId));
    await Promise.all(
      [...new Set(recipients)].map((recipient) =>
        this.notificationsService.create({
          userId: recipient,
          type: NotificationType.MAINTENANCE_UPDATED,
          title: 'Maintenance request updated',
          body: `${updated.title} is now ${updated.status.toLowerCase().replace('_', ' ')}.`,
          data: { maintenanceRequestId: updated.id, listingId: updated.listingId },
        }),
      ),
    );
    return updated;
  }

  private async findAccessible(userId: string, requestId: string): Promise<MaintenanceView> {
    const request = await this.prisma.maintenanceRequest.findUnique({ where: { id: requestId }, include: maintenanceInclude });
    if (!request) {
      throw new NotFoundException('Maintenance request not found');
    }
    if (![request.reporterId, request.landlordId, request.agentId, request.assignedToId].includes(userId)) {
      throw new ForbiddenException('You cannot access this maintenance request');
    }
    return request;
  }
}
