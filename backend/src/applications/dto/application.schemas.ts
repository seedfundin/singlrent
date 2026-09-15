import { ApplicationStatus } from '@prisma/client';
import { z } from 'zod';
import { paginationQuerySchema } from '../../common/http/pagination';

export const createApplicationSchema = z.object({
  listingId: z.string().uuid(),
  moveInDate: z.string().datetime(),
  leaseMonths: z.number().int().min(1).max(36),
  occupation: z.string().trim().max(150).optional(),
  occupantsCount: z.number().int().min(1).max(20),
  messageToLandlord: z.string().trim().max(2000).optional(),
});

export const applicationQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(ApplicationStatus).optional(),
});

export const rejectApplicationSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
});

export type CreateApplicationRequest = z.infer<typeof createApplicationSchema>;
export type ApplicationQuery = z.infer<typeof applicationQuerySchema>;
export type RejectApplicationRequest = z.infer<typeof rejectApplicationSchema>;
