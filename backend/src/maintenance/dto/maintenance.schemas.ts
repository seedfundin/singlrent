import { MaintenanceCategory, MaintenancePriority, MaintenanceStatus } from '@prisma/client';
import { z } from 'zod';
import { paginationQuerySchema } from '../../common/http/pagination';

const attachmentSchema = z.object({
  url: z.string().url().max(2000),
  publicId: z.string().trim().min(1).max(255),
  format: z.string().trim().max(30).optional(),
  bytes: z.number().int().positive().optional(),
});

export const createMaintenanceSchema = z.object({
  listingId: z.string().uuid(),
  title: z.string().trim().min(3).max(200),
  category: z.nativeEnum(MaintenanceCategory),
  description: z.string().trim().min(10).max(10000),
  priority: z.nativeEnum(MaintenancePriority).default(MaintenancePriority.MEDIUM),
  attachments: z.array(attachmentSchema).max(5).default([]),
});

export const updateMaintenanceSchema = z.object({
  body: z.string().trim().min(1).max(5000).optional(),
  status: z.nativeEnum(MaintenanceStatus).optional(),
  assignedToId: z.string().uuid().nullable().optional(),
});

export const maintenanceQuerySchema = paginationQuerySchema.extend({
  listingId: z.string().uuid().optional(),
  status: z.nativeEnum(MaintenanceStatus).optional(),
});

export type CreateMaintenanceRequest = z.infer<typeof createMaintenanceSchema>;
export type UpdateMaintenanceRequest = z.infer<typeof updateMaintenanceSchema>;
export type MaintenanceQuery = z.infer<typeof maintenanceQuerySchema>;
