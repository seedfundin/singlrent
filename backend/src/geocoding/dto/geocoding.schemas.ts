import { z } from 'zod';

export const geocodingSearchSchema = z.object({
  q: z.string().trim().min(3).max(500),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

export type GeocodingSearchRequest = z.infer<typeof geocodingSearchSchema>;
