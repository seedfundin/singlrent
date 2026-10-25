import { InspectionsService } from './inspections.service';

describe('inspection completion', () => {
  const listing = { id: 'listing', title: 'Home', status: 'PUBLISHED', availability: 'AVAILABLE', landlordId: 'landlord', managingAgentId: 'agent' };
  const makeBooking = () => ({ id: 'inspection', listingId: 'listing', tenantId: 'tenant', hostId: 'agent', landlordId: 'landlord', agentId: 'agent', status: 'CONFIRMED', startsAt: new Date(Date.now() - 60000), endsAt: new Date(), hostCompletedAt: null, tenantConfirmedAt: null, tenantDisputedAt: null });
  let booking: any;
  let service: InspectionsService;
  beforeEach(() => {
    booking = makeBooking();
    const tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      inspectionBooking: { findUniqueOrThrow: jest.fn(async () => booking), update: jest.fn(async ({ data }) => { booking = { ...booking, ...data }; return booking; }) },
      listing: { findUniqueOrThrow: jest.fn(async () => listing) },
    };
    const prisma = { inspectionBooking: { findUnique: jest.fn(async () => booking) }, listing: { findUnique: jest.fn(async () => listing) }, $transaction: async (fn: any) => fn(tx) };
    service = new InspectionsService(prisma as any, { create: jest.fn().mockResolvedValue(undefined) } as any, {} as any);
  });
  it('requires both the manager and tenant before completion', async () => {
    await service.action('landlord', 'inspection', 'complete');
    expect(booking.status).toBe('CONFIRMED');
    expect(booking.hostCompletedAt).toBeInstanceOf(Date);
    await service.action('tenant', 'inspection', 'confirm-attendance');
    expect(booking.status).toBe('COMPLETED');
  });
  it('holds disputed attendance until the tenant confirms', async () => {
    await service.action('agent', 'inspection', 'complete');
    await service.action('tenant', 'inspection', 'dispute-attendance');
    expect(booking.status).toBe('CONFIRMED');
    expect(booking.tenantDisputedAt).toBeInstanceOf(Date);
    await service.action('tenant', 'inspection', 'confirm-attendance');
    expect(booking.status).toBe('COMPLETED');
  });
  it('rejects unauthorized and future completion', async () => {
    await expect(service.action('stranger', 'inspection', 'complete')).rejects.toThrow();
    await expect(service.action('agent', 'inspection', 'confirm-attendance')).rejects.toThrow();
    booking.startsAt = new Date(Date.now() + 60000);
    await expect(service.action('agent', 'inspection', 'complete')).rejects.toThrow();
  });
});
