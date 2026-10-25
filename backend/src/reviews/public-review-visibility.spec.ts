import { ReviewStatus, ReviewTargetType } from '@prisma/client';
import { reviewQuerySchema } from './dto/review.schemas';
import { ReviewsService } from './reviews.service';

describe('public review visibility', () => {
  it('allows only listing, landlord, and agent feedback in public queries', () => {
    expect(reviewQuerySchema.parse({ listingId: 'c4481ab9-a1f4-4806-9d26-0e55d12421de', targetType: ReviewTargetType.LISTING }).targetType).toBe(ReviewTargetType.LISTING);
    expect(() => reviewQuerySchema.parse({ targetUserId: 'c4481ab9-a1f4-4806-9d26-0e55d12421de', targetType: ReviewTargetType.TENANT })).toThrow();
  });

  it('filters the public feed to published, non-tenant review subjects', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const prisma = {
      review: { findMany, count },
      $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    const service = new ReviewsService(prisma as never, {} as never);

    await service.list({ page: 1, pageSize: 5, listingId: 'listing-id' } as never);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        status: ReviewStatus.PUBLISHED,
        targetType: { in: [ReviewTargetType.LISTING, ReviewTargetType.LANDLORD, ReviewTargetType.AGENT] },
      }),
    }));
  });
});
