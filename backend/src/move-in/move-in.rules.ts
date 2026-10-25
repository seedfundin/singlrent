/** Domain rules for move-in verification. These are not wired into payment protection yet. */
export const checklistItems = [
  'PROPERTY_ACCESS', 'ELECTRICITY', 'WATER_SUPPLY', 'BATHROOM', 'DRAINAGE',
  'DOORS_WINDOWS', 'STRUCTURAL_SAFETY', 'PROPERTY_CONDITION', 'AMENITIES', 'REPAIRS',
] as const;

export type ChecklistItem = typeof checklistItems[number];
export type Severity = 'MINOR' | 'MAJOR' | 'CRITICAL';
export type Answer = { item: ChecklistItem; result: 'SATISFACTORY' | 'ISSUE_FOUND' | 'NOT_APPLICABLE'; description?: string };
export type CancellationRefundOutcome = 'VALID_PROPERTY_FAILURE' | 'TENANT_CHANGED_MIND';

export const CHANGE_OF_MIND_RENT_FEE_PERCENT = 3n;

export const defaultSeverity: Record<ChecklistItem, Severity> = {
  PROPERTY_ACCESS: 'CRITICAL', ELECTRICITY: 'MAJOR', WATER_SUPPLY: 'MAJOR',
  BATHROOM: 'MAJOR', DRAINAGE: 'MAJOR', DOORS_WINDOWS: 'MAJOR',
  STRUCTURAL_SAFETY: 'CRITICAL', PROPERTY_CONDITION: 'MAJOR', AMENITIES: 'MAJOR', REPAIRS: 'MAJOR',
};

/** Specific issue types prevent a cosmetic plumbing problem being treated like sewage. */
export const issueTypes = {
  INACCESSIBLE_PROPERTY: { item: 'PROPERTY_ACCESS', severity: 'CRITICAL' },
  DANGEROUS_WIRING: { item: 'ELECTRICITY', severity: 'CRITICAL' },
  MAJOR_SEWAGE_LEAK: { item: 'DRAINAGE', severity: 'CRITICAL' },
  STRUCTURAL_HAZARD: { item: 'STRUCTURAL_SAFETY', severity: 'CRITICAL' },
  NO_PROMISED_WATER: { item: 'WATER_SUPPLY', severity: 'MAJOR' },
  UNUSABLE_BATHROOM: { item: 'BATHROOM', severity: 'MAJOR' },
  SIGNIFICANT_PLUMBING: { item: 'DRAINAGE', severity: 'MAJOR' },
  MISSING_ESSENTIAL_AMENITY: { item: 'AMENITIES', severity: 'MAJOR' },
  MATERIAL_MISREPRESENTATION: { item: 'PROPERTY_CONDITION', severity: 'MAJOR' },
  OUTSTANDING_ESSENTIAL_REPAIR: { item: 'REPAIRS', severity: 'MAJOR' },
  ELECTRICAL_FAILURE: { item: 'ELECTRICITY', severity: 'MAJOR' },
  INSECURE_DOORS_WINDOWS: { item: 'DOORS_WINDOWS', severity: 'MAJOR' },
  DEFECTIVE_BATHROOM: { item: 'BATHROOM', severity: 'MAJOR' },
  WATER_SUPPLY_PROBLEM: { item: 'WATER_SUPPLY', severity: 'MAJOR' },
  MISSING_AGREED_REPAIRS: { item: 'REPAIRS', severity: 'MAJOR' },
  COSMETIC_IMPERFECTION: { item: 'PROPERTY_CONDITION', severity: 'MINOR' },
  MINOR_PLUMBING: { item: 'DRAINAGE', severity: 'MINOR' },
} as const satisfies Record<string, { item: ChecklistItem; severity: Severity }>;

export function validateSubmittedChecklist(answers: Answer[]): void {
  if (answers.length !== checklistItems.length || new Set(answers.map((answer) => answer.item)).size !== checklistItems.length || checklistItems.some((item) => !answers.some((answer) => answer.item === item))) {
    throw new Error('Each checklist item must be answered exactly once');
  }
  if (answers.some((answer) => answer.result === 'ISSUE_FOUND' && !answer.description?.trim())) {
    throw new Error('Describe each reported issue');
  }
  if (answers.find((answer) => answer.item === 'PROPERTY_ACCESS')?.result === 'NOT_APPLICABLE') {
    throw new Error('Property access cannot be marked not applicable');
  }
}

export function blocksVerification(issue: { severity: Severity; resolved: boolean; classificationDisputed: boolean }): boolean {
  return !issue.resolved && (issue.severity !== 'MINOR' || issue.classificationDisputed);
}

/** Use inside the same database transaction as release, after locking the payment-protection record. */
export function canReleaseVerifiedEscrow(input: {
  actorIsAdmin: boolean;
  escrowHeld: boolean;
  verificationApproved: boolean;
  agreementExecuted: boolean;
  guarantorFormExecuted: boolean;
  tenancyActive: boolean;
  openRefundRequest: boolean;
  adminHold: boolean;
  issues: Array<{ severity: Severity; resolved: boolean; classificationDisputed: boolean }>;
}): boolean {
  return input.actorIsAdmin && input.escrowHeld && input.verificationApproved && input.agreementExecuted && input.guarantorFormExecuted &&
    input.tenancyActive && !input.openRefundRequest && !input.adminHold && !input.issues.some(blocksVerification);
}

/** A scheduled start does not commence an unsigned, pending tenancy. */
export function canRequestPreTenancyRefund(status: string): boolean {
  return status === 'PENDING_MOVE_IN';
}

/**
 * A verified failure by the property returns the tenant's protected payment in full.
 * A tenant-initiated cancellation returns rent less the stated fee; the
 * caution balance is retained. Platform and agent fees are handled by the
 * payment service because they are outside the protected payment balance.
 */
export function cancellationRefundAmounts(
  outcome: CancellationRefundOutcome,
  rentKobo: bigint,
  cautionKobo: bigint,
): { rentRefundKobo: bigint; cautionRefundKobo: bigint; rentCancellationFeeKobo: bigint; cautionForfeitureKobo: bigint } {
  if (rentKobo < 0n || cautionKobo < 0n) throw new Error('Refund amounts cannot be negative');
  if (outcome === 'VALID_PROPERTY_FAILURE') {
    return { rentRefundKobo: rentKobo, cautionRefundKobo: cautionKobo, rentCancellationFeeKobo: 0n, cautionForfeitureKobo: 0n };
  }
  const rentCancellationFeeKobo = rentKobo * CHANGE_OF_MIND_RENT_FEE_PERCENT / 100n;
  return {
    rentRefundKobo: rentKobo - rentCancellationFeeKobo,
    cautionRefundKobo: 0n,
    rentCancellationFeeKobo,
    cautionForfeitureKobo: cautionKobo,
  };
}
