import { PaymentsService } from './payments.service';

describe('refund allocation locking', () => {
  it('locks the protected payment before reading the balance for a refund', async () => {
    const order: string[] = [];
    const tx = {
      $queryRaw: jest.fn(async () => { order.push('lock'); return []; }),
      payment: { findUnique: jest.fn(async () => { order.push('read'); return null; }) },
    };
    const prisma = { moveInVerification: { findUnique: jest.fn().mockResolvedValue(null) }, $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) };
    const service = new PaymentsService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    await expect(service.issueRefund('admin', 'a5a73838-cc40-4ed4-9a32-d9465c653a5e', { scope: 'RENT', amountKobo: '100', reason: 'refund' })).rejects.toThrow('confirmed protected payment');
    expect(order).toEqual(['lock', 'read']);
  });
  it('blocks approved cancellation after tenancy activation', async () => {
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      payment: { findUnique: jest.fn().mockResolvedValue({ status: 'SUCCESS', escrow: { status: 'HELD' }, moveInVerification: { tenancy: { status: 'ACTIVE' }, refundRequests: [{ id: 'request', status: 'PENDING' }] } }) },
      payout: { create: jest.fn() },
    };
    const prisma = { $transaction: async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) };
    const service = new PaymentsService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    await expect(service.approveMoveInRefund('admin', 'payment', 'request', 'Decision')).rejects.toThrow('no longer eligible');
    expect(tx.payout.create).not.toHaveBeenCalled();
  });
});
