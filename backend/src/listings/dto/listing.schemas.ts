import { ListingAvailability, ListingStatus, PropertyType } from '@prisma/client';
import { z } from 'zod';
import { paginationQuerySchema } from '../../common/http/pagination';

const moneySchema = z.string().regex(/^\d+$/).max(18);
const imageSchema = z.object({
  url: z.string().url().max(2000),
  publicId: z.string().trim().min(1).max(255),
  altText: z.string().trim().max(255).optional(),
  format: z.string().trim().max(30).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  bytes: z.number().int().positive().optional(),
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
  images: z.array(imageSchema).max(30).optional(),
});

export const createListingSchema = listingPayload.extend({
  landlordId: z.string().uuid().optional(),
});
export const updateListingSchema = listingPayload.partial();
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
});

export type CreateListingRequest = z.infer<typeof createListingSchema>;
export type UpdateListingRequest = z.infer<typeof updateListingSchema>;
export type ListingQuery = z.infer<typeof listingQuerySchema>;
