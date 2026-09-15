import { ReviewStatus, ReviewTargetType } from '@prisma/client';
import { z } from 'zod';
import { paginationQuerySchema } from '../../common/http/pagination';

export const createReviewSchema = z.object({
  tenancyId: z.string().uuid(),
  targetType: z.nativeEnum(ReviewTargetType),
  score: z.number().int().min(1).max(5),
  body: z.string().trim().min(10).max(2000),
});
export const reviewQuerySchema = paginationQuerySchema.extend({
  listingId: z.string().uuid().optional(),
  targetUserId: z.string().uuid().optional(),
});
export const moderateReviewSchema = z.object({
  status: z.enum([ReviewStatus.HIDDEN, ReviewStatus.REMOVED]),
  note: z.string().trim().min(3).max(1000),
});

export type CreateReviewRequest = z.infer<typeof createReviewSchema>;
export type ReviewQuery = z.infer<typeof reviewQuerySchema>;
export type ModerateReviewRequest = z.infer<typeof moderateReviewSchema>;
