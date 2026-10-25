import { ApplicationStatus } from '@prisma/client';
import { z } from 'zod';
import { paginationQuerySchema } from '../../common/http/pagination';

// This is intentionally a rental-readiness questionnaire, not a second KYC
// form. Government identifiers and bank details never belong in an
// application payload; Dojah handles those checks in its own secure flow.
export const tenantQuestionnaireSchema = z.object({
  employmentStatus: z.enum(['EMPLOYED', 'SELF_EMPLOYED', 'STUDENT', 'RETIRED', 'OTHER']),
  incomeRange: z.enum(['UNDER_100K', '100K_TO_250K', '250K_TO_500K', '500K_TO_1M', 'OVER_1M', 'PREFER_NOT_TO_SAY']),
  moveReason: z.enum(['NEW_JOB', 'RELOCATION', 'FAMILY', 'UPGRADING', 'FIRST_HOME', 'OTHER']),
  preferredContact: z.literal('IN_APP'),
  pets: z.enum(['YES', 'NO', 'PREFER_NOT_TO_SAY']),
  smoking: z.enum(['YES', 'NO', 'PREFER_NOT_TO_SAY']),
  intendedBusinessUse: z.enum(['YES', 'NO', 'PREFER_NOT_TO_SAY']),
  confirmsInformationIsAccurate: z.literal(true),
});

export const createApplicationSchema = z.object({
  listingId: z.string().uuid(),
  moveInDate: z.string().datetime(),
  leaseMonths: z.number().int().min(1).max(36),
  occupation: z.string().trim().max(150).optional(),
  occupantsCount: z.number().int().min(1).max(20),
  messageToLandlord: z.string().trim().max(2000).optional(),
  tenantQuestionnaire: tenantQuestionnaireSchema,
});

export const updateApplicationSchema = createApplicationSchema.omit({ listingId: true });

export const applicationQuerySchema = paginationQuerySchema.extend({
  status: z.nativeEnum(ApplicationStatus).optional(),
});

export const rejectApplicationSchema = z.object({
  reason: z.string().trim().min(3).max(1000),
});

export type CreateApplicationRequest = z.infer<typeof createApplicationSchema>;
export type UpdateApplicationRequest = z.infer<typeof updateApplicationSchema>;
export type ApplicationQuery = z.infer<typeof applicationQuerySchema>;
export type RejectApplicationRequest = z.infer<typeof rejectApplicationSchema>;
