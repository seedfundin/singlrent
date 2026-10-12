-- Email OTP is deliberately separate from KYC. It confirms account ownership
-- during registration without collecting or validating an identity document.
CREATE TABLE "email_verification_challenges" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "codeHash" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "email_verification_challenges_userId_expiresAt_idx"
ON "email_verification_challenges"("userId", "expiresAt");

ALTER TABLE "email_verification_challenges"
ADD CONSTRAINT "email_verification_challenges_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TYPE "VerificationServiceChargeSource" AS ENUM ('TENANT_PAYMENT', 'PAYOUT_DEDUCTION');
CREATE TYPE "VerificationServiceChargeStatus" AS ENUM ('PENDING_PAYMENT', 'PROCESSING', 'VERIFIED', 'REJECTED', 'FAILED');
ALTER TYPE "LedgerEntryType" ADD VALUE 'KYC_SERVICE_FEE_ALLOCATED';

ALTER TABLE "payouts" ADD COLUMN "serviceFeeKobo" BIGINT NOT NULL DEFAULT 0;

-- Every Dojah request gets one immutable service-charge record. This preserves
-- the ₦100 charge even if Dojah rejects or cannot complete the verification.
CREATE TABLE "verification_service_charges" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "payoutId" UUID,
    "source" "VerificationServiceChargeSource" NOT NULL,
    "status" "VerificationServiceChargeStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "amountKobo" BIGINT NOT NULL DEFAULT 10000,
    "currency" CHAR(3) NOT NULL DEFAULT 'NGN',
    "paystackReference" VARCHAR(150),
    "providerReference" VARCHAR(255),
    "ninCiphertext" TEXT NOT NULL,
    "ninLast4" CHAR(4) NOT NULL,
    "providerPayload" JSONB,
    "failureReason" VARCHAR(1000),
    "paidAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_service_charges_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "verification_service_charges_paystackReference_key"
ON "verification_service_charges"("paystackReference");
CREATE UNIQUE INDEX "verification_service_charges_providerReference_key"
ON "verification_service_charges"("providerReference");
CREATE INDEX "verification_service_charges_userId_status_createdAt_idx"
ON "verification_service_charges"("userId", "status", "createdAt");
CREATE INDEX "verification_service_charges_payoutId_createdAt_idx"
ON "verification_service_charges"("payoutId", "createdAt");

ALTER TABLE "verification_service_charges"
ADD CONSTRAINT "verification_service_charges_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "verification_service_charges"
ADD CONSTRAINT "verification_service_charges_payoutId_fkey"
FOREIGN KEY ("payoutId") REFERENCES "payouts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
