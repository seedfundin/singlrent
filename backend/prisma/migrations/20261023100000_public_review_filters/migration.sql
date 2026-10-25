-- Public listing feedback is always scoped to one review subject. These
-- indexes keep the listing and publisher panels responsive as review volumes grow.
CREATE INDEX "reviews_listingId_status_targetType_createdAt_idx"
  ON "reviews"("listingId", "status", "targetType", "createdAt");

CREATE INDEX "reviews_targetUserId_status_targetType_createdAt_idx"
  ON "reviews"("targetUserId", "status", "targetType", "createdAt");
