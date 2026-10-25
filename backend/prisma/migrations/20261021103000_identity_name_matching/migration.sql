-- Dojah identity proof must match the name registered on the SingleRent
-- account. Only the comparison outcome and a non-sensitive reason are kept;
-- provider identity names are never stored in this database.

CREATE TYPE "IdentityNameMatchStatus" AS ENUM ('NOT_CHECKED', 'MATCHED', 'MISMATCHED', 'UNAVAILABLE');

ALTER TYPE "PublisherVerificationStatus" ADD VALUE IF NOT EXISTS 'UNDER_REVIEW';

ALTER TABLE "kyc_profiles"
  ADD COLUMN "identityMethod" "PublisherVerificationMethod",
  ADD COLUMN "nameMatchStatus" "IdentityNameMatchStatus" NOT NULL DEFAULT 'NOT_CHECKED',
  ADD COLUMN "nameMatchReason" VARCHAR(1000);

ALTER TABLE "publisher_verifications"
  ADD COLUMN "nameMatchStatus" "IdentityNameMatchStatus" NOT NULL DEFAULT 'NOT_CHECKED',
  ADD COLUMN "nameMatchReason" VARCHAR(1000);

ALTER TABLE "publisher_verification_attempts"
  ADD COLUMN "nameMatchStatus" "IdentityNameMatchStatus" NOT NULL DEFAULT 'NOT_CHECKED',
  ADD COLUMN "nameMatchReason" VARCHAR(1000);

ALTER TABLE "verification_service_charges"
  ADD COLUMN "identityMethod" "PublisherVerificationMethod" NOT NULL DEFAULT 'NIN';
