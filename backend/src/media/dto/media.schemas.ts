import { z } from 'zod';

export const createUploadSignatureSchema = z.object({
  kind: z.enum(['listing', 'maintenance', 'profile', 'incident']),
  resourceType: z.enum(['image', 'video']).default('image'),
});

export type CreateUploadSignatureRequest = z.infer<typeof createUploadSignatureSchema>;
