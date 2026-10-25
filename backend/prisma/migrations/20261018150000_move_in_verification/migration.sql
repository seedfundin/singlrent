CREATE TABLE "move_in_verifications" (
  "id" UUID NOT NULL,
  "tenancyId" UUID NOT NULL,
  "paymentId" UUID NOT NULL,
  "status" VARCHAR(40) NOT NULL DEFAULT 'AWAITING_HANDOVER',
  "handoverAt" TIMESTAMP(3),
  "deadlineAt" TIMESTAMP(3),
  "draft" JSONB,
  "submittedAt" TIMESTAMP(3),
  "verifiedAt" TIMESTAMP(3),
  "adminHold" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "move_in_verifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "move_in_verifications_tenancyId_key" ON "move_in_verifications"("tenancyId");
CREATE UNIQUE INDEX "move_in_verifications_paymentId_key" ON "move_in_verifications"("paymentId");
CREATE INDEX "move_in_verifications_status_deadlineAt_idx" ON "move_in_verifications"("status", "deadlineAt");
ALTER TABLE "move_in_verifications" ADD CONSTRAINT "move_in_verifications_tenancyId_fkey" FOREIGN KEY ("tenancyId") REFERENCES "tenancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "move_in_verifications" ADD CONSTRAINT "move_in_verifications_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "move_in_issues" (
  "id" UUID NOT NULL,
  "verificationId" UUID NOT NULL,
  "item" VARCHAR(40) NOT NULL,
  "issueType" VARCHAR(80) NOT NULL,
  "description" VARCHAR(4000) NOT NULL,
  "severity" VARCHAR(12) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'OPEN',
  "classificationDisputed" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "move_in_issues_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "move_in_issues_verificationId_status_idx" ON "move_in_issues"("verificationId", "status");
ALTER TABLE "move_in_issues" ADD CONSTRAINT "move_in_issues_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "move_in_verifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "move_in_events" (
  "id" UUID NOT NULL,
  "verificationId" UUID NOT NULL,
  "actorId" UUID NOT NULL,
  "type" VARCHAR(60) NOT NULL,
  "details" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "move_in_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "move_in_events_verificationId_createdAt_idx" ON "move_in_events"("verificationId", "createdAt");
ALTER TABLE "move_in_events" ADD CONSTRAINT "move_in_events_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "move_in_verifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "move_in_refund_requests" (
  "id" UUID NOT NULL,
  "verificationId" UUID NOT NULL,
  "reason" VARCHAR(4000) NOT NULL,
  "status" VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "move_in_refund_requests_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "move_in_refund_requests_verificationId_status_idx" ON "move_in_refund_requests"("verificationId", "status");
ALTER TABLE "move_in_refund_requests" ADD CONSTRAINT "move_in_refund_requests_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "move_in_verifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "move_in_evidence" (
  "id" UUID NOT NULL,
  "verificationId" UUID NOT NULL,
  "issueId" UUID,
  "uploaderId" UUID NOT NULL,
  "objectKey" VARCHAR(500) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "move_in_evidence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "move_in_evidence_objectKey_key" ON "move_in_evidence"("objectKey");
CREATE INDEX "move_in_evidence_verificationId_issueId_idx" ON "move_in_evidence"("verificationId", "issueId");
ALTER TABLE "move_in_evidence" ADD CONSTRAINT "move_in_evidence_verificationId_fkey" FOREIGN KEY ("verificationId") REFERENCES "move_in_verifications"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
