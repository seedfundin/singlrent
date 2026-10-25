import { TenanciesService } from './tenancies.service';

describe('activation with move-in verification', () => {
  it('rejects activation without an executed agreement', async () => {
    const tenancy = { id: 'tenancy', status: 'PENDING_MOVE_IN', landlordId: 'landlord', agentId: null, application: { status: 'PAYMENT_HELD' } };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      moveInVerification: {
        findUnique: jest.fn().mockResolvedValue({ paymentId: 'payment' }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ status: 'VERIFIED', adminHold: false, issues: [], refundRequests: [], tenancy: { agreement: { status: 'DRAFT' }, guarantorForm: { status: 'PENDING_SIGNATURE' } }, payment: { escrow: { status: 'HELD' }, payouts: [] } }),
      },
      tenancy: { updateMany: jest.fn() },
    };
    const prisma = { tenancy: { findUnique: jest.fn().mockResolvedValue(tenancy) }, $transaction: (fn: any) => fn(tx) };
    const service = new TenanciesService(prisma as any, {} as any);
    await expect(service.activate('landlord', 'tenancy')).rejects.toThrow('signed agreement');
    expect(tx.tenancy.updateMany).not.toHaveBeenCalled();
  });
});
