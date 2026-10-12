-- Keep caution-deduction transfers distinct from rent payouts. This prevents a
-- caution settlement from being mistaken for the landlord's rent release.
ALTER TYPE "PayoutKind" ADD VALUE IF NOT EXISTS 'CAUTION_DEDUCTION';

CREATE TYPE "CautionDeductionOutcome" AS ENUM ('LANDLORD_PAID', 'TENANT_REFUND');
ALTER TABLE "caution_deductions"
  ADD COLUMN "resolution" "CautionDeductionOutcome";
