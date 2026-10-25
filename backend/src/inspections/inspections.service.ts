import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InspectionStatus, ListingAvailability, ListingStatus, NotificationType, Prisma, RoleCode } from '@prisma/client';
import { Queue } from 'bullmq';
import { PrismaService } from '../common/database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AvailabilityInput, BookingInput, availabilitySchema } from './inspection.schemas';
import { generateInspectionSlots } from './inspection-slots';

export const INSPECTION_QUEUE = 'inspections';
const active: InspectionStatus[] = [InspectionStatus.PENDING, InspectionStatus.CONFIRMED];

@Injectable()
export class InspectionsService {
  private readonly logger = new Logger(InspectionsService.name);
  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService, @InjectQueue(INSPECTION_QUEUE) private readonly queue: Queue) {}

  private async listing(id: string) {
    const listing = await this.prisma.listing.findUnique({ where: { id }, select: { id: true, title: true, status: true, availability: true, landlordId: true, managingAgentId: true } });
    if (!listing) throw new NotFoundException('Property not found');
    return listing;
  }
  private host(listing: { managingAgentId: string | null; landlordId: string }) { return listing.managingAgentId ?? listing.landlordId; }
  private assertManager(userId: string, listing: { managingAgentId: string | null; landlordId: string }) {
    if (listing.landlordId !== userId && listing.managingAgentId !== userId) throw new ForbiddenException('Only the property landlord or assigned agent can manage availability');
  }
  private assertOpen(listing: { status: ListingStatus; availability: ListingAvailability }) {
    if (listing.status !== ListingStatus.PUBLISHED || listing.availability !== ListingAvailability.AVAILABLE) throw new ConflictException('Inspections can only be requested for published, available properties');
  }
  private config(record: { mode: string; timezone: string; durationMinutes: number; automaticConfirmation: boolean; windows: Prisma.JsonValue } | null): AvailabilityInput {
    return availabilitySchema.parse(record ? { mode: record.mode, timezone: record.timezone, durationMinutes: record.durationMinutes, automaticConfirmation: record.automaticConfirmation, windows: record.windows } : { mode: 'BY_REQUEST', timezone: 'Africa/Lagos', durationMinutes: 30, automaticConfirmation: false, windows: [] });
  }
  async getAvailability(userId: string, listingId: string) {
    this.assertManager(userId, await this.listing(listingId));
    return this.config(await this.prisma.inspectionAvailability.findUnique({ where: { listingId } }));
  }
  async saveAvailability(userId: string, listingId: string, input: AvailabilityInput) {
    const listing = await this.listing(listingId);
    this.assertManager(userId, listing);
    const data = { ...input, windows: input.windows as Prisma.InputJsonValue };
    await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, listingId, this.host(listing));
      await tx.inspectionAvailability.upsert({ where: { listingId }, create: { listingId, ...data }, update: data });
    });
    return input;
  }
  async slots(listingId: string) {
    const listing = await this.listing(listingId);
    this.assertOpen(listing);
    const config = this.config(await this.prisma.inspectionAvailability.findUnique({ where: { listingId } }));
    const now = new Date();
    const bookings = await this.prisma.inspectionBooking.findMany({ where: { status: { in: active }, OR: [{ hostId: this.host(listing) }, { listingId }] }, select: { startsAt: true, endsAt: true, proposedStartsAt: true, proposedEndsAt: true } });
    const slots = generateInspectionSlots(config, now).filter((slot) => !bookings.some((booking) => this.overlap(new Date(slot.startsAt), new Date(slot.endsAt), booking.startsAt, booking.endsAt) || (booking.proposedStartsAt && booking.proposedEndsAt && this.overlap(new Date(slot.startsAt), new Date(slot.endsAt), booking.proposedStartsAt, booking.proposedEndsAt))));
    return { timezone: config.timezone, durationMinutes: config.durationMinutes, slots };
  }
  private overlap(start: Date, end: Date, otherStart: Date, otherEnd: Date) { return start < otherEnd && end > otherStart && otherEnd > new Date(); }
  private date(input: string) {
    const value = new Date(input);
    const now = Date.now();
    if (Number.isNaN(value.getTime()) || value.getTime() <= now || value.getTime() > now + 30 * 86400000) throw new BadRequestException('Choose a future time within the next 30 days');
    return value;
  }
  private async lock(transaction: Prisma.TransactionClient, listingId: string, hostId: string) {
    for (const key of [`inspection:host:${hostId}`, `inspection:listing:${listingId}`].sort()) await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
  }
  private async assertFree(transaction: Prisma.TransactionClient, listingId: string, hostId: string, start: Date, end: Date, exceptId?: string) {
    await transaction.inspectionBooking.updateMany({ where: { status: 'PENDING', startsAt: { lte: new Date() }, OR: [{ hostId }, { listingId }] }, data: { status: 'EXPIRED', proposedStartsAt: null, proposedEndsAt: null, proposedById: null } });
    const conflict = await transaction.inspectionBooking.findFirst({ where: {
      id: exceptId ? { not: exceptId } : undefined, status: { in: active },
      AND: [{ OR: [{ hostId }, { listingId }] }, { OR: [{ startsAt: { lt: end }, endsAt: { gt: start } }, { proposedStartsAt: { lt: end }, proposedEndsAt: { gt: start } }] }],
    }, select: { id: true } });
    if (conflict) throw new ConflictException('This time is no longer available. Please choose another time.');
  }
  async book(userId: string, listingId: string, input: BookingInput) {
    const listing = await this.listing(listingId);
    this.assertOpen(listing);
    if ([listing.landlordId, listing.managingAgentId].includes(userId)) throw new ForbiddenException('The property manager cannot request an inspection of their own listing');
    const tenant = await this.prisma.user.findFirst({ where: { id: userId, userRoles: { some: { role: { code: RoleCode.TENANT } } } }, select: { id: true } });
    if (!tenant) throw new ForbiddenException('Only tenants can request an inspection');
    const start = this.date(input.startsAt);
    const config = this.config(await this.prisma.inspectionAvailability.findUnique({ where: { listingId } }));
    if (input.source === 'SLOT' && !generateInspectionSlots(config, new Date()).some((slot) => slot.startsAt === start.toISOString())) throw new ConflictException('That slot is not currently offered');
    const end = new Date(start.getTime() + config.durationMinutes * 60000);
    const hostId = this.host(listing);
    const booking = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, listingId, hostId);
      const freshListing = await tx.listing.findUniqueOrThrow({ where: { id: listingId }, select: { status: true, availability: true, managingAgentId: true, landlordId: true } });
      this.assertOpen(freshListing);
      if (this.host(freshListing) !== hostId) throw new ConflictException('The inspection host changed; please try again');
      const currentConfig = this.config(await tx.inspectionAvailability.findUnique({ where: { listingId } }));
      if (input.source === 'SLOT' && (!generateInspectionSlots(currentConfig, new Date()).some((slot) => slot.startsAt === start.toISOString()) || currentConfig.durationMinutes !== config.durationMinutes)) throw new ConflictException('Availability changed; please select a time again');
      await this.assertFree(tx, listingId, hostId, start, end);
      return tx.inspectionBooking.create({ data: { listingId, tenantId: userId, hostId, landlordId: freshListing.landlordId, agentId: freshListing.managingAgentId, startsAt: start, endsAt: end, requestedById: userId, status: input.source === 'SLOT' && currentConfig.automaticConfirmation ? 'CONFIRMED' : 'PENDING' } });
    });
    await this.notify(hostId, 'Inspection requested', `${listing.title}: a tenant requested an inspection.`, booking.id);
    if (booking.status === 'CONFIRMED') await this.notify(userId, 'Inspection confirmed', `Your inspection for ${listing.title} is confirmed.`, booking.id);
    await this.schedule(booking.id, booking.startsAt).catch((error: unknown) => this.logger.error(`Inspection timer could not be queued: ${error instanceof Error ? error.message : 'unknown error'}`));
    return booking;
  }
  async list(userId: string) {
    const listings = await this.prisma.listing.findMany({ where: { landlordId: userId }, select: { id: true } });
    await this.prisma.inspectionBooking.updateMany({ where: { status: 'PENDING', startsAt: { lte: new Date() }, OR: [{ tenantId: userId }, { hostId: userId }, { listingId: { in: listings.map((l) => l.id) } }] }, data: { status: 'EXPIRED', proposedStartsAt: null, proposedEndsAt: null, proposedById: null } });
    const bookings = await this.prisma.inspectionBooking.findMany({ where: { OR: [{ tenantId: userId }, { hostId: userId }, { landlordId: userId }, { agentId: userId }, { listingId: { in: listings.map((l) => l.id) } }] }, orderBy: { startsAt: 'desc' }, take: 200 });
    const [properties, users, availability] = await Promise.all([
      this.prisma.listing.findMany({ where: { id: { in: [...new Set(bookings.map((b) => b.listingId))] } }, select: { id: true, title: true, landlordId: true, managingAgentId: true } }),
      this.prisma.user.findMany({ where: { id: { in: [...new Set(bookings.flatMap((b) => [b.tenantId, b.hostId]))] } }, select: { id: true, firstName: true, lastName: true } }),
      this.prisma.inspectionAvailability.findMany({ where: { listingId: { in: [...new Set(bookings.map((b) => b.listingId))] } }, select: { listingId: true, timezone: true } }),
    ]);
    return bookings.map((b) => ({ ...b, timezone: availability.find((a) => a.listingId === b.listingId)?.timezone ?? 'Africa/Lagos', listing: properties.find((l) => l.id === b.listingId), tenant: users.find((u) => u.id === b.tenantId), host: users.find((u) => u.id === b.hostId) }));
  }
  async action(userId: string, bookingId: string, action: 'approve' | 'decline' | 'cancel' | 'complete' | 'confirm-attendance' | 'dispute-attendance' | 'propose' | 'accept-proposal' | 'reject-proposal', startsAt?: string) {
    const original = await this.prisma.inspectionBooking.findUnique({ where: { id: bookingId } });
    if (!original) throw new NotFoundException('Inspection not found');
    const listing = await this.listing(original.listingId);
    const host = this.host(listing);
    const isHost = userId === host && original.hostId === host;
    const isTenant = userId === original.tenantId;
    const isManager = userId === original.landlordId || userId === original.agentId;
    if (!isHost && !isTenant && !(action === 'complete' && isManager)) throw new ForbiddenException('Only the tenant or assigned host may change this inspection');
    const proposalStart = action === 'propose' && startsAt ? this.date(startsAt) : undefined;
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lock(tx, original.listingId, original.hostId);
      const booking = await tx.inspectionBooking.findUniqueOrThrow({ where: { id: bookingId } });
      const currentListing = await tx.listing.findUniqueOrThrow({ where: { id: booking.listingId }, select: { status: true, availability: true, managingAgentId: true, landlordId: true } });
      if (!['complete', 'confirm-attendance', 'dispute-attendance'].includes(action) && this.host(currentListing) !== booking.hostId) throw new ConflictException('The assigned inspection host has changed; contact the property manager');
      if (!active.includes(booking.status)) throw new ConflictException('This inspection can no longer be changed');
      if (booking.startsAt <= new Date() && booking.status === 'PENDING') throw new ConflictException('This pending inspection has expired');
      if (action === 'approve') {
        this.assertOpen(currentListing);
        if (!isHost || booking.status !== 'PENDING' || booking.proposedStartsAt) throw new ForbiddenException('Only the assigned host can approve a pending request without an outstanding proposal');
        await this.assertFree(tx, booking.listingId, booking.hostId, booking.startsAt, booking.endsAt, booking.id);
        return tx.inspectionBooking.update({ where: { id: booking.id }, data: { status: 'CONFIRMED' } });
      }
      if (action === 'decline') {
        if (!isHost || booking.status !== 'PENDING') throw new ForbiddenException('Only the assigned host can decline a pending request');
        return tx.inspectionBooking.update({ where: { id: booking.id }, data: { status: 'DECLINED', proposedStartsAt: null, proposedEndsAt: null, proposedById: null } });
      }
      if (action === 'cancel') return tx.inspectionBooking.update({ where: { id: booking.id }, data: { status: 'CANCELLED', proposedStartsAt: null, proposedEndsAt: null, proposedById: null } });
      if (action === 'reject-proposal') {
        if (!booking.proposedById || booking.proposedById === userId) throw new ConflictException('There is no proposal from the other party to decline');
        return tx.inspectionBooking.update({ where: { id: booking.id }, data: { proposedStartsAt: null, proposedEndsAt: null, proposedById: null } });
      }
      if (action === 'complete') {
        if (!isManager || booking.status !== 'CONFIRMED' || booking.startsAt > new Date()) throw new ForbiddenException('Only the landlord or assigned agent can mark a confirmed inspection after its scheduled start');
        if (booking.proposedStartsAt) throw new ConflictException('Resolve the proposed reschedule before confirming attendance');
        return tx.inspectionBooking.update({ where: { id: booking.id }, data: { hostCompletedAt: new Date(), status: booking.tenantConfirmedAt && !booking.tenantDisputedAt ? 'COMPLETED' : 'CONFIRMED' } });
      }
      if (action === 'confirm-attendance' || action === 'dispute-attendance') {
        if (!isTenant || booking.status !== 'CONFIRMED' || booking.startsAt > new Date()) throw new ForbiddenException('Only the tenant can confirm or dispute a confirmed inspection after its scheduled start');
        if (booking.proposedStartsAt) throw new ConflictException('Resolve the proposed reschedule before confirming attendance');
        const confirmed = action === 'confirm-attendance';
        return tx.inspectionBooking.update({ where: { id: booking.id }, data: { tenantConfirmedAt: confirmed ? new Date() : null, tenantDisputedAt: confirmed ? null : new Date(), status: confirmed && booking.hostCompletedAt ? 'COMPLETED' : 'CONFIRMED' } });
      }
      if (action === 'propose') {
        this.assertOpen(currentListing);
        if (booking.hostCompletedAt || booking.tenantConfirmedAt || booking.tenantDisputedAt) throw new ConflictException('Attendance is being confirmed; this inspection cannot be rescheduled');
        if (!proposalStart) throw new BadRequestException('Choose a proposed time');
        const proposalEnd = new Date(proposalStart.getTime() + booking.endsAt.getTime() - booking.startsAt.getTime());
        await this.assertFree(tx, booking.listingId, booking.hostId, proposalStart, proposalEnd, booking.id);
        return tx.inspectionBooking.update({ where: { id: booking.id }, data: { proposedStartsAt: proposalStart, proposedEndsAt: proposalEnd, proposedById: userId } });
      }
      this.assertOpen(currentListing);
      if (!booking.proposedStartsAt || !booking.proposedEndsAt || !booking.proposedById || booking.proposedById === userId || booking.proposedStartsAt <= new Date()) throw new ConflictException('There is no valid proposal from the other party to accept');
      await this.assertFree(tx, booking.listingId, booking.hostId, booking.proposedStartsAt, booking.proposedEndsAt, booking.id);
      return tx.inspectionBooking.update({ where: { id: booking.id }, data: { startsAt: booking.proposedStartsAt, endsAt: booking.proposedEndsAt, status: 'CONFIRMED', proposedStartsAt: null, proposedEndsAt: null, proposedById: null } });
    });
    const recipient = isTenant ? original.hostId : original.tenantId;
    await this.notify(recipient, `Inspection ${action.replace('-', ' ')}`, `An inspection for ${listing.title} was updated.`, bookingId);
    if (['approve', 'accept-proposal'].includes(action)) await this.schedule(updated.id, updated.startsAt).catch((error: unknown) => this.logger.error(`Inspection timer could not be queued: ${error instanceof Error ? error.message : 'unknown error'}`));
    return updated;
  }
  private async notify(userId: string, title: string, body: string, bookingId: string) {
    await this.notifications.create({ userId, type: NotificationType.INSPECTION_UPDATED, title, body, data: { inspectionId: bookingId } }).catch((error: unknown) => this.logger.error(`Inspection notification failed: ${error instanceof Error ? error.message : 'unknown error'}`));
  }
  private async schedule(bookingId: string, start: Date) {
    for (const hours of [24, 2, 0]) {
      const delay = start.getTime() - Date.now() - hours * 3600000;
      if (delay < 0) continue;
      await this.queue.add('inspection-timer', { bookingId, startsAt: start.toISOString(), hours }, { jobId: `inspection-${bookingId}-${start.getTime()}-${hours}`, delay, attempts: 3, backoff: { type: 'exponential', delay: 10000 }, removeOnComplete: 1000, removeOnFail: 5000 });
    }
  }
  async timer(bookingId: string, startsAt: string, hours: number) {
    const booking = await this.prisma.inspectionBooking.findUnique({ where: { id: bookingId } });
    if (!booking || booking.startsAt.toISOString() !== startsAt) return;
    if (hours === 0) {
      await this.prisma.inspectionBooking.updateMany({ where: { id: bookingId, status: 'PENDING', startsAt: { lte: new Date() } }, data: { status: 'EXPIRED', proposedStartsAt: null, proposedEndsAt: null, proposedById: null } });
    } else if (booking.status === 'CONFIRMED') {
      await Promise.all([booking.tenantId, booking.hostId].map((id) => this.notify(id, 'Inspection reminder', `Your inspection is scheduled in approximately ${hours} hours.`, bookingId)));
    }
  }
}
