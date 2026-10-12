-- The review queue is retired. Listings that were already submitted for
-- review passed the verified-publisher and media checks, so make them public
-- without waiting for a manual approval.
UPDATE "listings"
SET
  "status" = 'PUBLISHED',
  "publishedAt" = COALESCE("publishedAt", "createdAt"),
  "moderatedByUserId" = NULL,
  "moderationNote" = NULL
WHERE "status" = 'PENDING_REVIEW';
