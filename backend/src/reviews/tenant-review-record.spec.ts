import { ReviewStatus, ReviewTargetType } from '@prisma/client';
import { tenantReviewRecordQuerySchema } from './dto/review.schemas';
import { ReviewsService } from './reviews.service';

describe('private tenant rental record', () => {
  const query = { source: 'TENANCY' as const, page: 1, pageSize: 4 };

  it('keeps the two feedback sources separate and filters to published tenant reviews', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = {
      rentalApplication: {
        findFirst: jest.fn().mockResolvedValue({ tenant: { id: 'tenant', firstName: 'Teni', lastName: 'Tenant' } }),
      },
      review: {
        findMany,
        count: jest.fn().mockResolvedValue(0),
        aggregate: jest.fn().mockResolvedValue({ _count: { id: 0 }, _avg: { score: null } }),
      },
      $transaction: jest.fn((operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    const service = new ReviewsService(prisma as any, { create: jest.fn() } as any);

    await service.tenantRecord('manager', 'application', query);

    expect(prisma.rentalApplication.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id: 'application',
        OR: [{ landlordId: 'manager' }, { agentId: 'manager' }],
      }),
    }));
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        targetUserId: 'tenant',
        targetType: ReviewTargetType.TENANT,
        status: ReviewStatus.PUBLISHED,
        tenancyId: { not: null },
      }),
    }));

    findMany.mockClear();
    await service.tenantRecord('manager', 'application', { ...query, source: 'INSPECTION' });
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ inspectionId: { not: null } }),
    }));
  });

  it('uses the inspection source only when explicitly requested', () => {
    expect(tenantReviewRecordQuerySchema.parse({}).source).toBe('TENANCY');
    expect(tenantReviewRecordQuerySchema.parse({ source: 'INSPECTION' }).source).toBe('INSPECTION');
  });
});
