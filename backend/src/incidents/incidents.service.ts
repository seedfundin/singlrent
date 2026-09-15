import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { IncidentStatus, NotificationType, Prisma } from '@prisma/client';
import { pageResult, Paginated } from '../common/http/pagination';
import { PrismaService } from '../common/database/prisma.service';
import { MediaService } from '../media/media.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateIncidentRequest, IncidentQuery, InvestigateIncidentRequest, ResolveIncidentRequest } from './dto/incident.schemas';

const incidentInclude = {
  listing: { select: { id: true, title: true, slug: true } },
  reporter: { select: { id: true, firstName: true, lastName: true } },
  assignedTo: { select: { id: true, firstName: true, lastName: true } },
  evidence: true,
} satisfies Prisma.IncidentReportInclude;

type IncidentView = Prisma.IncidentReportGetPayload<{ include: typeof incidentInclude }>;

@Injectable()
export class IncidentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mediaService: MediaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(reporterId: string, input: CreateIncidentRequest): Promise<IncidentView> {
    if (input.listingId) {
      const listing = await this.prisma.listing.findUnique({ where: { id: input.listingId }, select: { id: true } });
      if (!listing) {
        throw new NotFoundException('Listing not found');
      }
    }
    input.evidence.forEach((item) => this.mediaService.assertOwnedPublicId(item.publicId, reporterId, 'incident'));
    const reference = `SR-${new Date().getUTCFullYear()}-${Math.random().toString(36).slice(2, 9).toUpperCase()}`;
    return this.prisma.incidentReport.create({
      data: {
        reference,
        reporterId,
        listingId: input.listingId,
        type: input.type,
        severity: input.severity,
        description: input.description,
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : undefined,
        confidential: input.confidential,
        evidence: { create: input.evidence },
      },
      include: incidentInclude,
    });
  }

  async mine(userId: string, query: IncidentQuery): Promise<Paginated<IncidentView>> {
    return this.list({ reporterId: userId }, query);
  }

  async adminList(query: IncidentQuery): Promise<Paginated<IncidentView>> {
    return this.list({}, query);
  }

  async investigate(actorId: string, incidentId: string, input: InvestigateIncidentRequest): Promise<IncidentView> {
    const incident = await this.prisma.incidentReport.update({
      where: { id: incidentId },
      data: { status: IncidentStatus.INVESTIGATING, assignedToUserId: input.assignedToUserId },
      include: incidentInclude,
    }).catch(() => undefined);
    if (!incident) {
      throw new NotFoundException('Incident report not found');
    }
    await this.notificationsService.create({
      userId: incident.reporterId,
      type: NotificationType.INCIDENT_UPDATED,
      title: 'Incident report is under investigation',
      body: 'The operations team is reviewing your report.',
      data: { incidentId: incident.id },
    });
    return incident;
  }

  async resolve(actorId: string, incidentId: string, input: ResolveIncidentRequest): Promise<IncidentView> {
    const incident = await this.prisma.incidentReport.update({
      where: { id: incidentId },
      data: { status: input.close ? IncidentStatus.CLOSED : IncidentStatus.RESOLVED, resolutionNote: input.resolutionNote, assignedToUserId: actorId },
      include: incidentInclude,
    }).catch(() => undefined);
    if (!incident) {
      throw new NotFoundException('Incident report not found');
    }
    await this.notificationsService.create({
      userId: incident.reporterId,
      type: NotificationType.INCIDENT_UPDATED,
      title: 'Incident report updated',
      body: 'An update has been added to your incident report.',
      data: { incidentId: incident.id },
    });
    return incident;
  }

  private async list(where: Prisma.IncidentReportWhereInput, query: IncidentQuery): Promise<Paginated<IncidentView>> {
    const completeWhere = { ...where, status: query.status };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.incidentReport.findMany({ where: completeWhere, include: incidentInclude, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.incidentReport.count({ where: completeWhere }),
    ]);
    return pageResult(items, total, query);
  }
}
