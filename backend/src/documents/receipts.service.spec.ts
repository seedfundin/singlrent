import { PayoutKind } from '@prisma/client';
import { ReceiptsService } from './receipts.service';

describe('payout proofs of payment', () => {
  it('creates a downloadable receipt record for an agent payout confirmed by the provider', async () => {
    const upsert = jest.fn().mockResolvedValue({});
    const service = new ReceiptsService({} as never);
    await service.issuePayoutProofOfPayment(
      { receipt: { upsert } } as never,
      {
        id: 'payout-id',
        paymentId: 'payment-id',
        recipientUserId: 'agent-id',
        kind: PayoutKind.AGENT,
        amountKobo: 100000n,
        serviceFeeKobo: 2500n,
        providerReference: 'provider-reference',
        paidAt: new Date('2026-10-22T00:00:00.000Z'),
        payment: { reference: 'payment-reference', currency: 'NGN' },
      },
    );

    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        recipientUserId: 'agent-id',
        receiptNumber: expect.stringMatching(/^SR-POP-/),
        metadata: expect.objectContaining({ payoutKind: PayoutKind.AGENT, netAmountKobo: '97500' }),
      }),
    }));
  });

  it('does not create a landlord or agent proof for a tenant refund', async () => {
    const upsert = jest.fn();
    const service = new ReceiptsService({} as never);
    await service.issuePayoutProofOfPayment(
      { receipt: { upsert } } as never,
      { id: 'payout-id', paymentId: 'payment-id', recipientUserId: 'tenant-id', kind: PayoutKind.REFUND, amountKobo: 100000n, serviceFeeKobo: 0n, providerReference: 'provider-reference', paidAt: new Date(), payment: { reference: 'payment-reference', currency: 'NGN' } },
    );
    expect(upsert).not.toHaveBeenCalled();
  });
});
