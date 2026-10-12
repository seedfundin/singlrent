-- Separate identity proof required for landlords and agents before they can
-- create or submit a property listing. Transactional tenant KYC remains in
-- kyc_profiles and is deliberately not repurposed here.
CREATE TYPE "PublisherVerificationMethod" AS ENUM ('NIN', 'BVN');

CREATE TYPE "PublisherVerificationStatus" AS ENUM ('NOT_STARTED', 'PENDING', 'VERIFIED', 'REJECTED', 'FAILED');

CREATE TABLE "publisher_verifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "method" "PublisherVerificationMethod",
    "status" "PublisherVerificationStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "providerReference" VARCHAR(255),
    "providerVerificationType" VARCHAR(100),
    "providerStatus" VARCHAR(100),
    "livenessVerified" BOOLEAN NOT NULL DEFAULT false,
    "failureReason" VARCHAR(1000),
    "requestedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "publisher_verifications_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "publisher_verifications_userId_key" ON "publisher_verifications"("userId");
CREATE UNIQUE INDEX "publisher_verifications_providerReference_key" ON "publisher_verifications"("providerReference");
CREATE INDEX "publisher_verifications_status_requestedAt_idx" ON "publisher_verifications"("status", "requestedAt");

ALTER TABLE "publisher_verifications"
  ADD CONSTRAINT "publisher_verifications_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
