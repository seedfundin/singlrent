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

## Current scope

- PostgreSQL with Prisma migrations and seeded platform roles/permissions.
- JWT access tokens, rotating refresh tokens, password hashing and account status checks.
- Central role and permission guards, with a direct deny overriding a role grant.
- Redis, BullMQ and an initial durable notification queue.
- Authenticated Socket.IO connections at `/realtime`.

Domain modules for listings, bookings, payments, escrow, commissions, payouts, maintenance, conversations, messages, notifications, admin and audit are reserved for the next implementation phases. The money-moving modules will use a kobo-based, immutable ledger design rather than JavaScript floating-point values.
