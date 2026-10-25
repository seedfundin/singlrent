CREATE TYPE "GuarantorFormStatus" AS ENUM ('PENDING_SIGNATURE', 'EXECUTED');
CREATE TYPE "GuarantorSignatureMethod" AS ENUM ('ELECTRONIC_CONSENT', 'UPLOADED_SIGNED_COPY');

CREATE TABLE "guarantor_forms" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenancyId" UUID NOT NULL,
  "reference" VARCHAR(64) NOT NULL,
  "status" "GuarantorFormStatus" NOT NULL DEFAULT 'PENDING_SIGNATURE',
  "prospectiveTenantName" VARCHAR(200) NOT NULL,
  "guarantorName" VARCHAR(200) NOT NULL,
  "knownForYears" INTEGER NOT NULL,
  "homeAddress" VARCHAR(500) NOT NULL,
  "businessAddress" VARCHAR(500) NOT NULL,
  "telephone" VARCHAR(32) NOT NULL,
  "profession" VARCHAR(200) NOT NULL,
  "qualification" VARCHAR(300) NOT NULL,
  "passportObjectKey" VARCHAR(500) NOT NULL,
  "documentHash" CHAR(64) NOT NULL,
  "signatureMethod" "GuarantorSignatureMethod",
  "signerName" VARCHAR(200),
  "signedAt" TIMESTAMP(3),
  "uploadedSignedCopyObjectKey" VARCHAR(500),
  "submittedByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "guarantor_forms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "guarantor_forms_tenancyId_key" ON "guarantor_forms"("tenancyId");
CREATE UNIQUE INDEX "guarantor_forms_reference_key" ON "guarantor_forms"("reference");
CREATE UNIQUE INDEX "guarantor_forms_passportObjectKey_key" ON "guarantor_forms"("passportObjectKey");
CREATE UNIQUE INDEX "guarantor_forms_uploadedSignedCopyObjectKey_key" ON "guarantor_forms"("uploadedSignedCopyObjectKey");
CREATE INDEX "guarantor_forms_submittedByUserId_status_idx" ON "guarantor_forms"("submittedByUserId", "status");
CREATE INDEX "guarantor_forms_status_createdAt_idx" ON "guarantor_forms"("status", "createdAt");

ALTER TABLE "guarantor_forms"
  ADD CONSTRAINT "guarantor_forms_tenancyId_fkey"
    FOREIGN KEY ("tenancyId") REFERENCES "tenancies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "guarantor_forms_submittedByUserId_fkey"
    FOREIGN KEY ("submittedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
