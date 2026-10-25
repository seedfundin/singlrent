-- Make the two cancellation outcomes auditable in the financial ledger:
-- a tenant-initiated cancellation retains caution and 3% of rent, while a
-- property failure returns every amount paid by the tenant.

ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'CANCELLATION_FEE_ALLOCATED';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'PLATFORM_FEE_REFUNDED';
ALTER TYPE "LedgerEntryType" ADD VALUE IF NOT EXISTS 'AGENT_FEE_REFUNDED';
