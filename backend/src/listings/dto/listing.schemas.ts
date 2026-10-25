import { ListingAvailability, ListingMediaType, ListingStatus, PropertyType } from '@prisma/client';
import { z } from 'zod';
import { paginationQuerySchema } from '../../common/http/pagination';

const moneySchema = z.string().regex(/^\d+$/).max(18);
const listingMediaSchema = z.object({
  objectKey: z.string().trim().min(1).max(500),
  mediaType: z.nativeEnum(ListingMediaType),
  altText: z.string().trim().max(255).optional(),
  position: z.number().int().min(0).max(100).optional(),
});

const listingPayload = z.object({
  title: z.string().trim().min(5).max(200),
  description: z.string().trim().min(20).max(10000),
  propertyType: z.nativeEnum(PropertyType),
  annualRentKobo: moneySchema,
  serviceChargeKobo: moneySchema.default('0'),
  cautionFeeKobo: moneySchema.default('0'),
  bedrooms: z.number().int().min(0).max(30),
  bathrooms: z.number().int().min(0).max(30),
  state: z.string().trim().min(2).max(100),
  area: z.string().trim().min(2).max(150),
  address: z.string().trim().min(5).max(500),
  latitude: z.number().finite().min(-90).max(90).optional(),
  longitude: z.number().finite().min(-180).max(180).optional(),
  amenities: z.array(z.string().trim().min(1).max(100)).max(60).default([]),
  rules: z.record(z.union([z.string().max(250), z.boolean(), z.number().int()])).optional(),
  availableFrom: z.string().datetime().optional(),
  minimumLeaseMonths: z.number().int().min(1).max(36).default(12),
  media: z.array(listingMediaSchema).max(5).optional(),
});

export const createListingSchema = listingPayload.extend({
  landlordId: z.string().uuid().optional(),
});
export const updateListingSchema = listingPayload.partial().refine(
  (input) => Object.keys(input).length > 0,
  { message: 'Provide at least one listing field to update' },
);
export const listingQuerySchema = paginationQuerySchema.extend({
  state: z.string().trim().max(100).optional(),
  area: z.string().trim().max(150).optional(),
  propertyType: z.nativeEnum(PropertyType).optional(),
  bedrooms: z.coerce.number().int().min(0).max(30).optional(),
  minRentKobo: moneySchema.optional(),
  maxRentKobo: moneySchema.optional(),
  amenities: z.string().trim().max(500).optional(),
  status: z.nativeEnum(ListingStatus).optional(),
  availability: z.nativeEnum(ListingAvailability).optional(),
  // Reputation is never the default sort: people can deliberately choose it,
  // while relevance, availability and recency remain the ordinary discovery path.
  sort: z.enum(['RECENT', 'RECOMMENDED']).default('RECENT'),
});

export type CreateListingRequest = z.infer<typeof createListingSchema>;
export type UpdateListingRequest = z.infer<typeof updateListingSchema>;
export type ListingQuery = z.infer<typeof listingQuerySchema>;
