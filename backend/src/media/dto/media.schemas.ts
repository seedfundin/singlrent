import { z } from 'zod';

const uploadKindSchema = z.enum(['listing', 'maintenance', 'profile', 'incident', 'agreement', 'move_in', 'guarantor']);
const mediaTypeSchema = z.enum(['IMAGE', 'VIDEO', 'DOCUMENT']);

export const createPresignedUploadSchema = z.object({
  kind: uploadKindSchema,
  mediaType: mediaTypeSchema,
  mimeType: z.string().trim().min(3).max(100),
  size: z.number().int().positive().max(50 * 1024 * 1024),
  listingId: z.string().uuid().optional(),
  tenancyId: z.string().uuid().optional(),
});

export const deleteUploadSchema = z.object({
  objectKey: z.string().trim().min(1).max(500),
});

export type UploadKind = z.infer<typeof uploadKindSchema>;
export type RequestedMediaType = z.infer<typeof mediaTypeSchema>;
export type CreatePresignedUploadRequest = z.infer<typeof createPresignedUploadSchema>;
export type DeleteUploadRequest = z.infer<typeof deleteUploadSchema>;
