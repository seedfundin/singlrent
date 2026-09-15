import { z } from 'zod';

export const updateProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(100).optional(),
  lastName: z.string().trim().min(1).max(100).optional(),
  bio: z.string().trim().max(1000).nullable().optional(),
  profileImageUrl: z.string().url().nullable().optional(),
  profileImagePublicId: z.string().trim().max(255).nullable().optional(),
  occupation: z.string().trim().max(150).nullable().optional(),
  defaultOccupants: z.number().int().min(1).max(20).optional(),
  businessName: z.string().trim().max(200).nullable().optional(),
  companyName: z.string().trim().max(200).nullable().optional(),
  licenceNumber: z.string().trim().max(100).nullable().optional(),
});

export const sendPhoneVerificationSchema = z.object({
  phone: z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, 'Use an E.164 phone number'),
});

export const confirmPhoneVerificationSchema = z.object({
  challengeId: z.string().uuid(),
  code: z.string().regex(/^\d{6}$/),
});

export const submitNinSchema = z.object({
  nin: z.string().regex(/^\d{11}$/, 'NIN must contain 11 digits'),
});

export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;
export type SendPhoneVerificationRequest = z.infer<typeof sendPhoneVerificationSchema>;
export type ConfirmPhoneVerificationRequest = z.infer<typeof confirmPhoneVerificationSchema>;
export type SubmitNinRequest = z.infer<typeof submitNinSchema>;
