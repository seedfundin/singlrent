import { z } from 'zod';
import { paginationQuerySchema } from '../../common/http/pagination';

export const paymentQuerySchema = paginationQuerySchema;
export const paymentInitializationSchema = z.object({
  applicationId: z.string().uuid(),
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

export type PaymentQuery = z.infer<typeof paymentQuerySchema>;
export type PaymentInitializationRequest = z.infer<typeof paymentInitializationSchema>;
export type PaystackWebhookRequest = z.infer<typeof paystackWebhookSchema>;
export type CautionDeductionRequest = z.infer<typeof cautionDeductionSchema>;
export type ResolveCautionDeductionRequest = z.infer<typeof resolveCautionDeductionSchema>;
