import { ModuleRef } from '@nestjs/core';
import { NotificationType, PayoutKind, PayoutStatus } from '@prisma/client';
import { PayoutExecutionService } from './payout-execution.service';
import { PrismaService } from '../common/database/prisma.service';
import { PaystackService } from '../integrations/paystack.service';
import { LedgerService } from './ledger.service';
import { ReceiptsService } from '../documents/receipts.service';

describe('provider-confirmed payout notifications', () => {
  const payout = { id: 'payout', recipientUserId: 'recipient', paymentId: 'payment', kind: PayoutKind.LANDLORD, status: PayoutStatus.PROCESSING, amountKobo: 10000n, serviceFeeKobo: 0n, payment: { reference: 'ref', currency: 'NGN' } };
  let transaction: any;
  let notify: jest.Mock;
  let service: PayoutExecutionService;

  beforeEach(() => {
    transaction = { payout: { findUnique: jest.fn().mockResolvedValue(payout), updateMany: jest.fn().mockResolvedValue({ count: 1 }) }, escrowRecord: { findUnique: jest.fn().mockResolvedValue(null) } };
    notify = jest.fn().mockResolvedValue({});
    service = new PayoutExecutionService(
      { $transaction: (fn: (tx: unknown) => unknown) => fn(transaction) } as unknown as PrismaService,
      {} as PaystackService,
      { record: jest.fn().mockResolvedValue(undefined) } as unknown as LedgerService,
      { issuePayoutProofOfPayment: jest.fn().mockResolvedValue(undefined) } as unknown as ReceiptsService,
      { get: jest.fn().mockReturnValue({ create: notify }) } as unknown as ModuleRef,
    );
  });

  it('notifies the recipient only after a provider-confirmed payout', async () => {
    await service.markProviderResult('provider-ref', true);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: 'recipient', type: NotificationType.ESCROW_UPDATED, data: { paymentId: 'payment', payoutId: 'payout' } }));
  });

  it('does not notify for a duplicate callback or a lost concurrent claim', async () => {
    transaction.payout.findUnique.mockResolvedValueOnce({ ...payout, status: PayoutStatus.PAID });
    await service.markProviderResult('provider-ref', true);
    transaction.payout.updateMany.mockResolvedValueOnce({ count: 0 });
    await service.markProviderResult('provider-ref', true);
    expect(notify).not.toHaveBeenCalled();
  });

  it('does not announce a failed payout as paid', async () => {
    await service.markProviderResult('provider-ref', false, 'failed');
    expect(notify).not.toHaveBeenCalled();
  });

  it('does not fail an already confirmed payout if notifications are unavailable', async () => {
    notify.mockRejectedValueOnce(new Error('unavailable'));
    await expect(service.markProviderResult('provider-ref', true)).resolves.toBeUndefined();
  });
});
