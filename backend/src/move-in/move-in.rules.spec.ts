import { blocksVerification, canReleaseVerifiedEscrow, canRequestPreTenancyRefund, cancellationRefundAmounts, checklistItems, issueTypes, validateSubmittedChecklist } from './move-in.rules';

describe('move-in rules', () => {
  const answers = checklistItems.map((item) => ({ item, result: 'SATISFACTORY' as const }));
  it('requires every checklist item and confirmed access', () => {
    expect(() => validateSubmittedChecklist(answers)).not.toThrow();
    expect(() => validateSubmittedChecklist(answers.slice(1))).toThrow('exactly once');
    expect(() => validateSubmittedChecklist(answers.map((a) => a.item === 'PROPERTY_ACCESS' ? { ...a, result: 'NOT_APPLICABLE' } : a))).toThrow('access');
  });
  it('requires descriptions for issues', () => {
    expect(() => validateSubmittedChecklist(answers.map((a) => a.item === 'DRAINAGE' ? { ...a, result: 'ISSUE_FOUND' } : a))).toThrow('Describe');
  });
  it('distinguishes cosmetic, major and critical issues', () => {
    expect(issueTypes.MINOR_PLUMBING.severity).toBe('MINOR');
    expect(issueTypes.SIGNIFICANT_PLUMBING.severity).toBe('MAJOR');
    expect(issueTypes.MAJOR_SEWAGE_LEAK.severity).toBe('CRITICAL');
    expect(blocksVerification({ severity: 'MINOR', resolved: false, classificationDisputed: false })).toBe(false);
    expect(blocksVerification({ severity: 'MINOR', resolved: false, classificationDisputed: true })).toBe(true);
    expect(blocksVerification({ severity: 'CRITICAL', resolved: false, classificationDisputed: false })).toBe(true);
    expect(blocksVerification({ severity: 'CRITICAL', resolved: true, classificationDisputed: false })).toBe(false);
  });
  it('allows cancellation refunds only while the tenancy is pending, even after its scheduled start', () => {
    expect(canRequestPreTenancyRefund('PENDING_MOVE_IN')).toBe(true);
    expect(canRequestPreTenancyRefund('ACTIVE')).toBe(false);
    expect(canRequestPreTenancyRefund('ENDED')).toBe(false);
    expect(canRequestPreTenancyRefund('CANCELLED')).toBe(false);
  });
  it('requires an admin, verified checklist, signed documents, activation and no hold before release', () => {
    const ready = { actorIsAdmin: true, escrowHeld: true, verificationApproved: true, agreementExecuted: true, guarantorFormExecuted: true, tenancyActive: true, openRefundRequest: false, adminHold: false, issues: [] };
    expect(canReleaseVerifiedEscrow(ready)).toBe(true);
    expect(canReleaseVerifiedEscrow({ ...ready, actorIsAdmin: false })).toBe(false);
    expect(canReleaseVerifiedEscrow({ ...ready, verificationApproved: false })).toBe(false);
    expect(canReleaseVerifiedEscrow({ ...ready, agreementExecuted: false })).toBe(false);
    expect(canReleaseVerifiedEscrow({ ...ready, guarantorFormExecuted: false })).toBe(false);
    expect(canReleaseVerifiedEscrow({ ...ready, tenancyActive: false })).toBe(false);
    expect(canReleaseVerifiedEscrow({ ...ready, openRefundRequest: true })).toBe(false);
    expect(canReleaseVerifiedEscrow({ ...ready, issues: [{ severity: 'MAJOR', resolved: false, classificationDisputed: false }] })).toBe(false);
    expect(canReleaseVerifiedEscrow({ ...ready, issues: [{ severity: 'MINOR', resolved: false, classificationDisputed: false }] })).toBe(true);
  });
  it('returns every eligible amount for a valid property failure', () => {
    expect(cancellationRefundAmounts('VALID_PROPERTY_FAILURE', 100_000_000n, 20_000_000n)).toEqual({ rentRefundKobo: 100_000_000n, cautionRefundKobo: 20_000_000n, rentCancellationFeeKobo: 0n, cautionForfeitureKobo: 0n });
  });
  it('refunds rent less 3% and retains caution when the tenant changes their mind', () => {
    expect(cancellationRefundAmounts('TENANT_CHANGED_MIND', 100_000_000n, 20_000_000n)).toEqual({ rentRefundKobo: 97_000_000n, cautionRefundKobo: 0n, rentCancellationFeeKobo: 3_000_000n, cautionForfeitureKobo: 20_000_000n });
    expect(() => cancellationRefundAmounts('TENANT_CHANGED_MIND', -1n, 0n)).toThrow();
  });
});
