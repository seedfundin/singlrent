CREATE TYPE "InspectionStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DECLINED', 'CANCELLED', 'COMPLETED', 'EXPIRED');
CREATE TYPE "InspectionMode" AS ENUM ('WEEKLY', 'SPECIFIC_DATES', 'BY_REQUEST');

CREATE TABLE "inspection_availability" (
  "id" UUID NOT NULL,
  "listingId" UUID NOT NULL,
  "mode" "InspectionMode" NOT NULL DEFAULT 'BY_REQUEST',
  "timezone" VARCHAR(100) NOT NULL DEFAULT 'Africa/Lagos',
  "durationMinutes" INTEGER NOT NULL DEFAULT 30,
  "automaticConfirmation" BOOLEAN NOT NULL DEFAULT false,
  "windows" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inspection_availability_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inspection_availability_duration_check" CHECK ("durationMinutes" IN (30, 60)),
  CONSTRAINT "inspection_availability_listing_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "inspection_availability_listingId_key" ON "inspection_availability"("listingId");

CREATE TABLE "inspection_bookings" (
  "id" UUID NOT NULL,
  "listingId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "hostId" UUID NOT NULL,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "InspectionStatus" NOT NULL DEFAULT 'PENDING',
  "requestedById" UUID NOT NULL,
  "proposedStartsAt" TIMESTAMP(3),
  "proposedEndsAt" TIMESTAMP(3),
  "proposedById" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "inspection_bookings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "inspection_bookings_time_check" CHECK ("endsAt" > "startsAt"),
  CONSTRAINT "inspection_bookings_proposal_check" CHECK (("proposedStartsAt" IS NULL AND "proposedEndsAt" IS NULL AND "proposedById" IS NULL) OR ("proposedStartsAt" IS NOT NULL AND "proposedEndsAt" > "proposedStartsAt" AND "proposedById" IS NOT NULL)),
  CONSTRAINT "inspection_bookings_listing_fkey" FOREIGN KEY ("listingId") REFERENCES "listings"("id") ON DELETE RESTRICT,
  CONSTRAINT "inspection_bookings_tenant_fkey" FOREIGN KEY ("tenantId") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "inspection_bookings_host_fkey" FOREIGN KEY ("hostId") REFERENCES "users"("id") ON DELETE RESTRICT
);
CREATE INDEX "inspection_bookings_hostId_status_startsAt_idx" ON "inspection_bookings"("hostId", "status", "startsAt");
CREATE INDEX "inspection_bookings_listingId_status_startsAt_idx" ON "inspection_bookings"("listingId", "status", "startsAt");
CREATE INDEX "inspection_bookings_tenantId_createdAt_idx" ON "inspection_bookings"("tenantId", "createdAt");
