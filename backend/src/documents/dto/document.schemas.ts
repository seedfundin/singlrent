import { z } from 'zod';

export const electronicSignatureSchema = z.object({
  signerName: z.string().trim().min(2).max(200),
  acceptTerms: z.literal(true),
});

export const uploadedSignedCopySchema = z.object({
  signerName: z.string().trim().min(2).max(200),
  objectKey: z.string().trim().min(1).max(500),
});

export const guarantorFormSchema = z.object({
  guarantorName: z.string().trim().min(2).max(200),
  knownForYears: z.number().int().min(0).max(100),
  homeAddress: z.string().trim().min(5).max(500),
  businessAddress: z.string().trim().min(5).max(500),
  telephone: z.string().trim().min(7).max(32),
  profession: z.string().trim().min(2).max(200),
  qualification: z.string().trim().min(2).max(300),
  passportObjectKey: z.string().trim().min(1).max(500).optional(),
});

export type ElectronicSignatureRequest = z.infer<typeof electronicSignatureSchema>;
export type UploadedSignedCopyRequest = z.infer<typeof uploadedSignedCopySchema>;
export type GuarantorFormRequest = z.infer<typeof guarantorFormSchema>;
