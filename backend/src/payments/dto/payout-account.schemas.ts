import { z } from 'zod';

export const savePayoutAccountSchema = z.object({
  // Nigerian NUBAN accounts are ten digits. The value is sent directly to
  // Paystack and is never persisted by SingleRent.
  accountNumber: z.string().regex(/^\d{10}$/, 'Account number must contain 10 digits'),
  bankCode: z.string().trim().min(1).max(32),
});

export type SavePayoutAccountRequest = z.infer<typeof savePayoutAccountSchema>;
