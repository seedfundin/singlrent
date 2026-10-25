-- Store the legal charge independently so it can be fully reversed only for
-- an approved material property failure.
ALTER TABLE "payments"
  ADD COLUMN "legalFeeKobo" BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN "cancellationPolicyAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "cancellationPolicyVersion" VARCHAR(50);

ALTER TYPE "LedgerAccountCode" ADD VALUE IF NOT EXISTS 'LEGAL_FEE_REVENUE';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'LEGAL_FEE_ALLOCATED';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'LEGAL_FEE_REFUNDED';
