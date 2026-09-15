# SingleRent backend

NestJS API foundation for SingleRent. It is intentionally separate from the existing frontend so both applications can be deployed and scaled independently.

## Local setup

```bash
cp .env.example .env
docker compose up -d
npm install
npm run prisma:generate
npm run prisma:deploy
npm run prisma:seed
npm run start:dev
```

The Compose database is intentionally exposed on port `5433` to avoid clashing with an existing local PostgreSQL server on the usual `5432` port.

The API starts at `http://localhost:4000`, Swagger is at `http://localhost:4000/docs`, and the health check is `GET /api/v1/health`.

## First endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/v1/health` | Public health check |
| `POST` | `/api/v1/auth/register` | Register a tenant, landlord, or agent |
| `POST` | `/api/v1/auth/login` | Email/password sign-in |
| `POST` | `/api/v1/auth/refresh` | Rotate a refresh token |
| `POST` | `/api/v1/auth/logout` | Revoke the submitted refresh token |
| `GET` | `/api/v1/auth/me` | Get the authenticated user |

Use `Authorization: Bearer <accessToken>` for protected endpoints. Socket.IO clients connect to `/realtime` using the same access token in `auth.token` or the `Authorization` header.

## Dojah NIN KYC

SingleRent verifies a user's identity through Dojah's NIN lookup against NIMC. Entering an 11-digit NIN first creates a `PENDING` submission; it changes to `VERIFIED` only after Dojah returns a valid NIMC identity record and its phone number matches the user's verified Nigerian phone number.

1. Create and complete compliance for a Dojah app, then add `DOJAH_APP_ID` and `DOJAH_SECRET_KEY` to the backend environment. Use `DOJAH_BASE_URL=https://sandbox.dojah.io` for Dojah sandbox testing.
2. The authenticated client sends `POST /api/v1/users/me/kyc/nin` with the NIN. The backend calls Dojah directly; the secret key never reaches the browser.
3. A successful, matching result returns `VERIFIED`. An invalid NIN or a NIMC phone mismatch returns `REJECTED`. Provider outages, unavailable credentials, or wallet/rate-limit errors leave the user unverified and return an error.

Admins can reject a KYC submission, but cannot approve or verify it. `VERIFIED` is reachable solely through a successful Dojah NIN result.

## Current scope

- PostgreSQL with Prisma migrations and seeded platform roles/permissions.
- JWT access tokens, rotating refresh tokens, password hashing and account status checks.
- Central role and permission guards, with a direct deny overriding a role grant.
- Redis, BullMQ and an initial durable notification queue.
- Authenticated Socket.IO connections at `/realtime`.

Domain modules for listings, bookings, payments, escrow, commissions, payouts, maintenance, conversations, messages, notifications, admin and audit are reserved for the next implementation phases. The money-moving modules will use a kobo-based, immutable ledger design rather than JavaScript floating-point values.
