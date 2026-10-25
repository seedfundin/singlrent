-- Account recovery, agent eligibility, applicant context, tenancy agreements,
-- payment receipts, and tenancy-based reputation. These are additive changes;
-- no existing payment, tenancy, or identity data is rewritten.

ALTER TYPE "ReviewTargetType" ADD VALUE IF NOT EXISTS 'TENANT';

CREATE TYPE "AgreementStatus" AS ENUM ('PENDING_SIGNATURES', 'PARTIALLY_SIGNED', 'EXECUTED', 'SUPERSEDED', 'VOID');
CREATE TYPE "AgreementSignerRole" AS ENUM ('TENANT', 'LANDLORD', 'AGENT');
CREATE TYPE "AgreementSignatureMethod" AS ENUM ('ELECTRONIC_CONSENT', 'UPLOADED_SIGNED_COPY');
CREATE TYPE "ReceiptKind" AS ENUM ('TENANT_PAYMENT_CONFIRMED', 'LANDLORD_PAYOUT_DISBURSED');

ALTER TABLE "agent_profiles" ADD COLUMN "dateOfBirth" DATE;

ALTER TABLE "rental_applications"
  ADD COLUMN "tenantQuestionnaire" JSONB,
  ADD COLUMN "questionnaireSubmittedAt" TIMESTAMP(3);

ALTER TABLE "reviews"
  ADD COLUMN "tenancyId" UUID,
  ADD COLUMN "disputedAt" TIMESTAMP(3),
  ADD COLUMN "disputeReason" VARCHAR(1000),
  ADD COLUMN "disputeResolvedAt" TIMESTAMP(3),
  ADD COLUMN "ratingDimensions" JSONB,
  ADD COLUMN "moderatedByUserId" UUID,
  ADD COLUMN "moderatedAt" TIMESTAMP(3);

CREATE TABLE "password_reset_challenges" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL,
  "codeHash" CHAR(64) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "requestedIp" VARCHAR(64),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "password_reset_challenges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "publisher_verification_attempts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "verificationId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "method" "PublisherVerificationMethod" NOT NULL,
  "status" "PublisherVerificationStatus" NOT NULL DEFAULT 'PENDING',
  "providerReference" VARCHAR(255) NOT NULL,
  "providerVerificationType" VARCHAR(100),
  "providerStatus" VARCHAR(100),
  "livenessVerified" BOOLEAN NOT NULL DEFAULT false,
  "failureReason" VARCHAR(1000),
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "publisher_verification_attempts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tenancy_agreements" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenancyId" UUID NOT NULL,
  "reference" VARCHAR(64) NOT NULL,
  "status" "AgreementStatus" NOT NULL DEFAULT 'PENDING_SIGNATURES',
  "termsVersion" VARCHAR(50) NOT NULL,
  "renderedTerms" JSONB NOT NULL,
  "documentHash" CHAR(64) NOT NULL,
  "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "executedAt" TIMESTAMP(3),
  "voidedAt" TIMESTAMP(3),
  "voidReason" VARCHAR(1000),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "tenancy_agreements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "agreement_signatures" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "agreementId" UUID NOT NULL,
  "signerUserId" UUID NOT NULL,
  "signerRole" "AgreementSignerRole" NOT NULL,
  "method" "AgreementSignatureMethod" NOT NULL,
  "signerName" VARCHAR(200) NOT NULL,
  "signedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ipAddressHash" CHAR(64),
  "userAgentHash" CHAR(64),
  "uploadedDocumentUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "agreement_signatures_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "receipts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "receiptNumber" VARCHAR(64) NOT NULL,
  "kind" "ReceiptKind" NOT NULL,
  "paymentId" UUID NOT NULL,
  "payoutId" UUID,
  "recipientUserId" UUID NOT NULL,
  "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "voidedAt" TIMESTAMP(3),
  "metadata" JSONB NOT NULL,
  CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "password_reset_challenges_userId_expiresAt_idx" ON "password_reset_challenges"("userId", "expiresAt");
CREATE UNIQUE INDEX "publisher_verification_attempts_providerReference_key" ON "publisher_verification_attempts"("providerReference");
CREATE INDEX "publisher_verification_attempts_userId_requestedAt_idx" ON "publisher_verification_attempts"("userId", "requestedAt");
CREATE INDEX "publisher_verification_attempts_verificationId_requestedAt_idx" ON "publisher_verification_attempts"("verificationId", "requestedAt");
CREATE UNIQUE INDEX "tenancy_agreements_tenancyId_key" ON "tenancy_agreements"("tenancyId");
CREATE UNIQUE INDEX "tenancy_agreements_reference_key" ON "tenancy_agreements"("reference");
CREATE INDEX "tenancy_agreements_status_generatedAt_idx" ON "tenancy_agreements"("status", "generatedAt");
CREATE UNIQUE INDEX "agreement_signatures_agreementId_signerUserId_key" ON "agreement_signatures"("agreementId", "signerUserId");
CREATE INDEX "agreement_signatures_signerUserId_signedAt_idx" ON "agreement_signatures"("signerUserId", "signedAt");
CREATE UNIQUE INDEX "receipts_receiptNumber_key" ON "receipts"("receiptNumber");
CREATE UNIQUE INDEX "receipts_paymentId_kind_key" ON "receipts"("paymentId", "kind");
CREATE UNIQUE INDEX "receipts_payoutId_kind_key" ON "receipts"("payoutId", "kind");
CREATE INDEX "receipts_recipientUserId_issuedAt_idx" ON "receipts"("recipientUserId", "issuedAt");
CREATE INDEX "reviews_tenancyId_authorId_idx" ON "reviews"("tenancyId", "authorId");

ALTER TABLE "password_reset_challenges" ADD CONSTRAINT "password_reset_challenges_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "publisher_verification_attempts" ADD CONSTRAINT "publisher_verification_attempts_verificationId_fkey"
  FOREIGN KEY ("verificationId") REFERENCES "publisher_verifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "publisher_verification_attempts" ADD CONSTRAINT "publisher_verification_attempts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tenancyId_fkey"
  FOREIGN KEY ("tenancyId") REFERENCES "tenancies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tenancy_agreements" ADD CONSTRAINT "tenancy_agreements_tenancyId_fkey"
  FOREIGN KEY ("tenancyId") REFERENCES "tenancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "agreement_signatures" ADD CONSTRAINT "agreement_signatures_agreementId_fkey"
  FOREIGN KEY ("agreementId") REFERENCES "tenancy_agreements"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agreement_signatures" ADD CONSTRAINT "agreement_signatures_signerUserId_fkey"
  FOREIGN KEY ("signerUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_payoutId_fkey"
  FOREIGN KEY ("payoutId") REFERENCES "payouts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_recipientUserId_fkey"
  FOREIGN KEY ("recipientUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
