-- Replace the legacy listing image record with R2-backed typed media.
CREATE TYPE "ListingMediaType" AS ENUM ('IMAGE', 'VIDEO');

ALTER TABLE "listing_images" RENAME TO "listing_media";
ALTER TABLE "listing_media" RENAME COLUMN "publicId" TO "objectKey";
ALTER TABLE "listing_media" RENAME COLUMN "format" TO "mimeType";
ALTER TABLE "listing_media" ALTER COLUMN "objectKey" TYPE VARCHAR(500);
ALTER TABLE "listing_media" ALTER COLUMN "mimeType" TYPE VARCHAR(100);
ALTER TABLE "listing_media" ADD COLUMN "mediaType" "ListingMediaType" NOT NULL DEFAULT 'IMAGE';

-- Existing records remain available as images. New R2 uploads always use an exact MIME type.
UPDATE "listing_media"
SET "mimeType" = CASE lower(coalesce("mimeType", ''))
  WHEN 'jpg' THEN 'image/jpeg'
  WHEN 'jpeg' THEN 'image/jpeg'
  WHEN 'png' THEN 'image/png'
  WHEN 'webp' THEN 'image/webp'
  ELSE 'application/octet-stream'
END;
ALTER TABLE "listing_media" ALTER COLUMN "mimeType" SET NOT NULL;
ALTER TABLE "listing_media" ALTER COLUMN "mediaType" DROP DEFAULT;

ALTER INDEX "listing_images_pkey" RENAME TO "listing_media_pkey";
ALTER INDEX "listing_images_publicId_key" RENAME TO "listing_media_objectKey_key";
ALTER INDEX "listing_images_listingId_position_idx" RENAME TO "listing_media_listingId_position_idx";
ALTER TABLE "listing_media" RENAME CONSTRAINT "listing_images_listingId_fkey" TO "listing_media_listingId_fkey";

CREATE INDEX "listing_media_listingId_mediaType_idx" ON "listing_media"("listingId", "mediaType");
