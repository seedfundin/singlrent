-- A provider recipient represents a bank destination, which can legitimately
-- be shared by different SingleRent users. Each user still has only one saved
-- payout account through the unique userId constraint.
DROP INDEX IF EXISTS "payout_accounts_recipientCode_key";
