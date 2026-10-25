import { MoveInService } from './move-in.service';
import { checklistItems } from './move-in.rules';

describe('move-in checklist service', () => {
  const answers = checklistItems.map((item) => ({ item, result: 'SATISFACTORY' as const }));
  let verification: any;
  let tx: any;
  let agreements: any;
  let service: MoveInService;
  beforeEach(() => {
    verification = { id: 'verification', paymentId: 'payment', handoverAt: new Date(), submittedAt: null, adminHold: false, issues: [], tenancy: { tenantId: 'tenant', landlordId: 'landlord', agentId: null, status: 'PENDING_MOVE_IN' } };
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      moveInVerification: { findUnique: jest.fn(async () => verification), findUniqueOrThrow: jest.fn(async () => verification), update: jest.fn().mockResolvedValue({}) },
      moveInIssue: { createMany: jest.fn().mockResolvedValue({ count: 1 }), create: jest.fn().mockResolvedValue({ id: 'issue' }), update: jest.fn().mockResolvedValue({}) },
      moveInEvent: { create: jest.fn().mockResolvedValue({}) },
      escrowRecord: { findUnique: jest.fn().mockResolvedValue({ status: 'HELD' }) },
    };
    agreements = { createForTenancy: jest.fn().mockResolvedValue(undefined) };
    service = new MoveInService({ ...tx, tenancy: { findUnique: jest.fn().mockResolvedValue(null) }, $transaction: async (fn: any) => fn(tx) } as any, agreements as any, {} as any, {} as any, {} as any, { get: jest.fn() } as any);
  });
  it('creates the existing agreement only after a satisfactory checklist', async () => {
    await service.submit('tenant', 'tenancy', answers);
    expect(tx.moveInVerification.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'VERIFIED' }) }));
    expect(agreements.createForTenancy).toHaveBeenCalledWith(tx, 'tenancy');
  });
  it('blocks the agreement for a serious sewage issue', async () => {
    await service.submit('tenant', 'tenancy', answers.map((answer) => answer.item === 'DRAINAGE' ? { ...answer, result: 'ISSUE_FOUND', description: 'Sewage leak', issueType: 'MAJOR_SEWAGE_LEAK' } : answer));
    expect(tx.moveInVerification.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'ISSUE_REPORTED' }) }));
    expect(agreements.createForTenancy).not.toHaveBeenCalled();
  });
  it('does not allow another participant to submit or rewrite a submitted checklist', async () => {
    await expect(service.submit('landlord', 'tenancy', answers)).rejects.toThrow();
    verification.submittedAt = new Date();
    await expect(service.saveDraft('tenant', 'tenancy', answers)).rejects.toThrow('not editable');
  });
  it('rejects refund requests after tenancy activation', async () => {
    verification.tenancy.status = 'ACTIVE';
    await expect(service.requestRefund('tenant', 'tenancy', 'Unsafe condition')).rejects.toThrow('before tenancy activation');
  });
  it('allows the tenant to report inaccessible property before handover without confirming access', async () => {
    verification.handoverAt = null;
    await service.reportAdditionalIssue('tenant', 'tenancy', 'PROPERTY_ACCESS', 'INACCESSIBLE_PROPERTY', 'No keys provided');
    expect(tx.moveInIssue.create).toHaveBeenCalled();
    expect(tx.moveInVerification.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'ISSUE_REPORTED' }) }));
  });
  it('does not verify or generate an agreement when an admin resolves an issue before checklist submission', async () => {
    verification.issues = [{ id: 'issue', status: 'OPEN', severity: 'CRITICAL', classificationDisputed: false }];
    await service.resolveIssueByAdmin('admin', 'tenancy', 'issue', 'Issue reviewed');
    expect(tx.moveInVerification.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'IN_PROGRESS', verifiedAt: null }) }));
    expect(agreements.createForTenancy).not.toHaveBeenCalled();
  });
  it('does not let another participant report an issue on behalf of the tenant', async () => {
    await expect(service.reportAdditionalIssue('landlord', 'tenancy', 'PROPERTY_ACCESS', 'INACCESSIBLE_PROPERTY', 'No keys')).rejects.toThrow();
    expect(tx.moveInIssue.create).not.toHaveBeenCalled();
  });
});
