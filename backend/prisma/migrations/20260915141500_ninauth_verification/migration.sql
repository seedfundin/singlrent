-- CreateTable
CREATE TABLE "ninauth_verifications" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "state" VARCHAR(255) NOT NULL,
    "codeVerifier" VARCHAR(255) NOT NULL,
    "ninFingerprint" CHAR(64) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ninauth_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ninauth_verifications_state_key" ON "ninauth_verifications"("state");

-- CreateIndex
CREATE INDEX "ninauth_verifications_userId_expiresAt_idx" ON "ninauth_verifications"("userId", "expiresAt");

-- AddForeignKey
ALTER TABLE "ninauth_verifications" ADD CONSTRAINT "ninauth_verifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
