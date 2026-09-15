import { IncidentSeverity, IncidentStatus, IncidentType } from '@prisma/client';
import { z } from 'zod';
import { paginationQuerySchema } from '../../common/http/pagination';

const evidenceSchema = z.object({
  url: z.string().url().max(2000),
  publicId: z.string().trim().min(1).max(255),
  format: z.string().trim().max(30).optional(),
  bytes: z.number().int().positive().optional(),
});
export const createIncidentSchema = z.object({
  listingId: z.string().uuid().optional(),
  type: z.nativeEnum(IncidentType),
  severity: z.nativeEnum(IncidentSeverity),
  description: z.string().trim().min(10).max(10000),
  occurredAt: z.string().datetime().optional(),
  confidential: z.boolean().default(true),
  evidence: z.array(evidenceSchema).max(10).default([]),
});
export const incidentQuerySchema = paginationQuerySchema.extend({ status: z.nativeEnum(IncidentStatus).optional() });
export const investigateIncidentSchema = z.object({ assignedToUserId: z.string().uuid().optional(), note: z.string().trim().max(2000).optional() });
export const resolveIncidentSchema = z.object({ resolutionNote: z.string().trim().min(3).max(2000), close: z.boolean().default(false) });

export type CreateIncidentRequest = z.infer<typeof createIncidentSchema>;
export type IncidentQuery = z.infer<typeof incidentQuerySchema>;
export type InvestigateIncidentRequest = z.infer<typeof investigateIncidentSchema>;
export type ResolveIncidentRequest = z.infer<typeof resolveIncidentSchema>;
