# Cloudflare R2 listing media

Listing media is uploaded directly from the browser to Cloudflare R2. The API creates a scoped, 10-minute presigned `PUT` URL; R2 credentials never leave the Nest backend.

## Backend configuration

Copy these values into `backend/.env` after creating an R2 bucket and an R2 API token with access limited to that bucket:

```dotenv
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_R2_ACCESS_KEY_ID=
CLOUDFLARE_R2_SECRET_ACCESS_KEY=
CLOUDFLARE_R2_BUCKET_NAME=
CLOUDFLARE_R2_PUBLIC_URL=https://media.example.com
```

`CLOUDFLARE_R2_PUBLIC_URL` must be the public custom domain (or R2 public development URL) used to serve listing media. Do not add any of the access credentials to the frontend environment.

## R2 CORS

The browser sends a direct `PUT` with `Content-Type` to the R2 S3 endpoint. Add the app origins to the bucket CORS policy, then include every deployed frontend origin:

```json
[
  {
    "AllowedOrigins": ["http://localhost:3000", "https://your-app.example.com"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

The signed URL restricts the object key and the content type. The server validates the R2 object again before storing it on a listing.

## Listing media rules

- Drafts may have incomplete media.
- Submission and admin approval require 3–4 JPEG, PNG, or WebP images (each 5 MB or less), and exactly one MP4, WebM, or MOV video (50 MB or less).
- A listing may have at most five media files. Images keep their selected order; the first image is the cover. The video is never used as the cover.

Run `npm run prisma:deploy` in `backend/` before starting the API to apply the `ListingMedia` migration.
