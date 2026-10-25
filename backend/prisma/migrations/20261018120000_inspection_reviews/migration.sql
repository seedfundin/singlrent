ALTER TABLE "inspection_bookings"
  ADD COLUMN "landlordId" UUID,
  ADD COLUMN "agentId" UUID,
  ADD COLUMN "hostCompletedAt" TIMESTAMP(3),
  ADD COLUMN "tenantConfirmedAt" TIMESTAMP(3),
  ADD COLUMN "tenantDisputedAt" TIMESTAMP(3);

ALTER TABLE "reviews" ADD COLUMN "inspectionId" UUID;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_inspectionId_fkey"
  FOREIGN KEY ("inspectionId") REFERENCES "inspection_bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "reviews_inspectionId_authorId_idx" ON "reviews"("inspectionId", "authorId");
CREATE UNIQUE INDEX "reviews_inspection_subject_unique"
  ON "reviews" ("inspectionId", "authorId", "targetType")
  WHERE "inspectionId" IS NOT NULL;
