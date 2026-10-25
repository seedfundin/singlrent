import { ReviewTargetType } from '@prisma/client';
import { ReviewsService } from './reviews.service';

describe('inspection review eligibility', () => {
  const base = { id: 'inspection', status: 'COMPLETED', tenantId: 'tenant', landlordId: 'landlord', agentId: 'agent', hostId: 'agent', listingId: 'listing', hostCompletedAt: new Date(), tenantConfirmedAt: new Date(), tenantDisputedAt: null };
  const input = { inspectionId: 'inspection', targetType: ReviewTargetType.LISTING, score: 5, body: 'A useful review' };
  let booking: typeof base;
  let duplicate: unknown;
  let tx: any;
  let service: ReviewsService;
  beforeEach(() => {
    booking = { ...base };
    duplicate = null;
    tx = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      inspectionBooking: { findUnique: jest.fn(async () => booking), findUniqueOrThrow: jest.fn(async () => booking) },
      review: { findFirst: jest.fn(async () => duplicate), create: jest.fn(async ({ data }) => ({ ...data, id: 'review' })) },
      tenancy: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    service = new ReviewsService({ $transaction: async (fn: any) => fn(tx) } as any, { create: jest.fn() } as any);
  });
  it('allows a tenant to review the property and its recorded participants', async () => {
    await service.create('tenant', input);
    expect(tx.review.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ listingId: 'listing', inspectionId: 'inspection' }) }));
    await service.create('tenant', { ...input, targetType: ReviewTargetType.LANDLORD });
    expect(tx.review.create).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ targetUserId: 'landlord' }) }));
  });
  it('allows the landlord and assigned agent to review the tenant', async () => {
    for (const author of ['landlord', 'agent']) {
      await service.create(author, { ...input, targetType: ReviewTargetType.TENANT });
      expect(tx.review.create).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ targetUserId: 'tenant' }) }));
    }
  });
  it('limits inspection feedback about a tenant to inspection-specific categories', async () => {
    await service.create('landlord', { ...input, targetType: ReviewTargetType.TENANT, ratingDimensions: { attendance: 5, punctuality: 4, communication: 5 } });
    await expect(service.create('agent', { ...input, targetType: ReviewTargetType.TENANT, ratingDimensions: { paymentReliability: 5 } })).rejects.toThrow('attendance, punctuality, and communication only');
  });
  it.each(['PENDING', 'CONFIRMED', 'CANCELLED', 'DECLINED'])('rejects a %s inspection', async (status) => {
    booking = { ...base, status };
    await expect(service.create('tenant', input)).rejects.toThrow('confirmed by both parties');
  });
  it('rejects disputed or unconfirmed attendance', async () => {
    booking = { ...base, tenantDisputedAt: new Date() } as unknown as typeof base;
    await expect(service.create('tenant', input)).rejects.toThrow('confirmed by both parties');
    booking = { ...base, tenantConfirmedAt: null } as unknown as typeof base;
    await expect(service.create('tenant', input)).rejects.toThrow('confirmed by both parties');
  });
  it('rejects nonparticipants and duplicate subjects', async () => {
    await expect(service.create('stranger', input)).rejects.toThrow();
    duplicate = { id: 'existing' };
    await expect(service.create('tenant', input)).rejects.toThrow('already reviewed');
  });
  it('rejects self reviews and ambiguous interaction references', async () => {
    booking = { ...base, landlordId: 'tenant' };
    await expect(service.create('tenant', { ...input, targetType: ReviewTargetType.LANDLORD })).rejects.toThrow('yourself');
    await expect(service.create('tenant', { ...input, tenancyId: 'tenancy' })).rejects.toThrow('exactly one');
  });
  it('keeps ended-tenancy reviews eligible', async () => {
    tx.tenancy.findFirst.mockResolvedValue({ id: 'tenancy', status: 'ENDED', tenantId: 'tenant', landlordId: 'landlord', agentId: null, listingId: 'listing' });
    await service.create('tenant', { tenancyId: 'tenancy', targetType: ReviewTargetType.LISTING, score: 4, body: 'A tenancy review' });
    expect(tx.review.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ tenancyId: 'tenancy', listingId: 'listing' }) }));
  });
});
