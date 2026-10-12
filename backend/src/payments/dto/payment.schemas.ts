import { z } from 'zod';
import { paginationQuerySchema } from '../../common/http/pagination';

export const paymentQuerySchema = paginationQuerySchema;
export const paymentInitializationSchema = z.object({
  applicationId: z.string().uuid(),
});
export const payoutWithdrawSchema = z.object({
  // Required only when the recipient has not already completed one-time KYC.
  nin: z.string().regex(/^\d{11}$/, 'NIN must contain 11 digits').optional(),
});
export const paystackWebhookSchema = z.object({
  event: z.string().min(1).max(120),
  data: z.record(z.unknown()),
});
export const cautionDeductionSchema = z.object({
  amountKobo: z.string().regex(/^\d+$/).max(18),
  reason: z.string().trim().min(3).max(1000),
  evidence: z.array(z.string().url().max(2000)).max(10).optional(),
});
export const resolveCautionDeductionSchema = z.object({
  note: z.string().trim().min(3).max(1000).optional(),
});
export const refundPaymentSchema = z.object({
  scope: z.enum(['RENT', 'CAUTION']),
  amountKobo: z.string().regex(/^\d+$/).max(18),
  reason: z.string().trim().min(3).max(1000),
});
export const resolveCautionDisputeSchema = z.object({
  outcome: z.enum(['RETURN_TO_TENANT', 'PAY_LANDLORD']),
  note: z.string().trim().min(3).max(1000),
});

export type PaymentQuery = z.infer<typeof paymentQuerySchema>;
export type PaymentInitializationRequest = z.infer<typeof paymentInitializationSchema>;
export type PayoutWithdrawRequest = z.infer<typeof payoutWithdrawSchema>;
export type PaystackWebhookRequest = z.infer<typeof paystackWebhookSchema>;
export type CautionDeductionRequest = z.infer<typeof cautionDeductionSchema>;
export type ResolveCautionDeductionRequest = z.infer<typeof resolveCautionDeductionSchema>;
export type RefundPaymentRequest = z.infer<typeof refundPaymentSchema>;
export type ResolveCautionDisputeRequest = z.infer<typeof resolveCautionDisputeSchema>;
