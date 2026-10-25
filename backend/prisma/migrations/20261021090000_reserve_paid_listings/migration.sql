-- Bring existing transactions in line with the reservation rule. New payments
-- are reserved in PaymentsService; this only corrects rows created before the
-- rule was introduced.

UPDATE "listings" AS listing
SET "availability" = 'RENTED'
WHERE listing."status" <> 'ARCHIVED'
  AND listing."availability" = 'AVAILABLE'
  AND EXISTS (
    SELECT 1
    FROM "tenancies" AS tenancy
    WHERE tenancy."listingId" = listing."id"
      AND tenancy."status" = 'ACTIVE'
  );

UPDATE "listings" AS listing
SET "availability" = 'UNAVAILABLE'
WHERE listing."status" <> 'ARCHIVED'
  AND listing."availability" = 'AVAILABLE'
  AND EXISTS (
    SELECT 1
    FROM "payments" AS payment
    INNER JOIN "rental_applications" AS application
      ON application."id" = payment."applicationId"
    WHERE payment."listingId" = listing."id"
      AND payment."status" = 'SUCCESS'
      AND application."status" = 'PAYMENT_HELD'
  );
