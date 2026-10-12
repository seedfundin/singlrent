-- One reusable Paystack destination per user. The account number itself is
-- intentionally not persisted; only Paystack's recipient code and safe
-- display metadata are kept.
CREATE TABLE "payout_accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "provider" "PaymentProvider" NOT NULL DEFAULT 'PAYSTACK',
    "recipientCode" VARCHAR(255) NOT NULL,
    "bankCode" VARCHAR(32) NOT NULL,
    "bankName" VARCHAR(180) NOT NULL,
    "accountName" VARCHAR(255) NOT NULL,
    "accountLast4" CHAR(4) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'NGN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payout_accounts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payout_accounts_userId_key" ON "payout_accounts"("userId");
CREATE UNIQUE INDEX "payout_accounts_recipientCode_key" ON "payout_accounts"("recipientCode");
CREATE INDEX "payout_accounts_provider_recipientCode_idx" ON "payout_accounts"("provider", "recipientCode");

ALTER TABLE "payout_accounts"
  ADD CONSTRAINT "payout_accounts_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
