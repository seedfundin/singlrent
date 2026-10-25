import { ReviewStatus, ReviewTargetType } from '@prisma/client';
import { z } from 'zod';
import { paginationQuerySchema } from '../../common/http/pagination';

const ratingDimensionsSchema = z.object({
  accuracy: z.number().int().min(1).max(5).optional(),
  condition: z.number().int().min(1).max(5).optional(),
  communication: z.number().int().min(1).max(5).optional(),
  reliability: z.number().int().min(1).max(5).optional(),
  attendance: z.number().int().min(1).max(5).optional(),
  punctuality: z.number().int().min(1).max(5).optional(),
  paymentReliability: z.number().int().min(1).max(5).optional(),
  propertyCare: z.number().int().min(1).max(5).optional(),
  tenancyObligations: z.number().int().min(1).max(5).optional(),
}).strict().optional();

const publicReviewTargetTypeSchema = z.union([
  z.literal(ReviewTargetType.LISTING),
  z.literal(ReviewTargetType.LANDLORD),
  z.literal(ReviewTargetType.AGENT),
]);

export const createReviewSchema = z.object({
  tenancyId: z.string().uuid().optional(),
  inspectionId: z.string().uuid().optional(),
  targetType: z.nativeEnum(ReviewTargetType),
  score: z.number().int().min(1).max(5),
  body: z.string().trim().min(10).max(2000),
  ratingDimensions: ratingDimensionsSchema,
}).refine((value) => Boolean(value.tenancyId) !== Boolean(value.inspectionId), { message: 'Provide exactly one tenancy or inspection' });
export const reviewQuerySchema = paginationQuerySchema.extend({
  listingId: z.string().uuid().optional(),
  targetUserId: z.string().uuid().optional(),
  // Tenant ratings are deliberately not part of the public review surface.
  // They will receive their own access and privacy policy before release.
  targetType: publicReviewTargetTypeSchema.optional(),
});
export const adminReviewQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(ReviewStatus).optional(),
});

export const tenantReviewRecordQuerySchema = paginationQuerySchema.extend({
  source: z.enum(['TENANCY', 'INSPECTION']).default('TENANCY'),
});
export const moderateReviewSchema = z.object({
  status: z.enum([ReviewStatus.PUBLISHED, ReviewStatus.HIDDEN, ReviewStatus.REMOVED]),
  note: z.string().trim().min(3).max(1000),
});

export const disputeReviewSchema = z.object({
  reason: z.string().trim().min(10).max(1000),
});

export type CreateReviewRequest = z.infer<typeof createReviewSchema>;
export type ReviewQuery = z.infer<typeof reviewQuerySchema>;
export type AdminReviewQuery = z.infer<typeof adminReviewQuerySchema>;
export type TenantReviewRecordQuery = z.infer<typeof tenantReviewRecordQuerySchema>;
export type ModerateReviewRequest = z.infer<typeof moderateReviewSchema>;
export type DisputeReviewRequest = z.infer<typeof disputeReviewSchema>;
