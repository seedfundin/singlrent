# SingleRent Development Checklist

**Audit date:** 14 October 2026
**Implementation update:** 14 October 2026 — this update records code added after the original audit. It does not claim live provider, database, browser, or production verification where none was run.
**Scope:** `design-prototype` frontend, `design-prototype/backend` Nest API, Prisma schema, API surface, deployment-facing configuration, and automated tests.
**Audit boundary:** This is a source-code and build audit. No application code, configuration, migrations, provider dashboards, or deployed data were changed. A feature is only called **verified** below when it was covered by the repository test/build checks; code that looks connected but was not exercised against its real provider is labelled **partial** or **implemented but unverified**.

## 1. Project Audit Summary

SingleRent has a solid implementation foundation: a typed React/Vinext frontend, NestJS API, Prisma/PostgreSQL domain model, JWT authentication, role/permission guards, listing media validation, applications, Paystack-oriented escrow/payout records, maintenance, conversations, notifications, reviews, incidents, and administrator operations.

The core rental journey is **implemented in code but not end-to-end verified**: a tenant can register, apply, receive approval, satisfy the current NIN check, initiate payment, have a successful payment recorded into escrow, and then progress to a tenancy. The source contains important domain protections, including ownership checks, state checks, validation, webhook signatures, idempotent-style payment processing, audit logging, and R2 upload validation. However, live provider credentials/configuration, database state, webhooks, queues, email delivery, real Paystack transfers, Dojah results, and user journeys could not be exercised by this audit.

### Verification performed

- [x] `backend`: `npm test -- --runInBand` passed — **5 suites / 11 tests** after the implementation update.
- [x] `backend`: `npm run build` passed (`nest build`).
- [x] `frontend`: `npm run build` passed and pre-rendered **52 routes**.
- [x] Inspected Prisma models, backend controllers/services, frontend API client/components, configuration validation, and the existing test suite.
- [ ] No browser E2E, API integration, webhook, database migration, provider sandbox, email, Redis worker, R2, Dojah, Paystack, Google Maps, or production deployment test was run. These remain required before release claims can be made.

## Implementation progress — 14 October 2026

This is the current delivery record. “Implemented” means the code, schema and frontend/API wiring exist and the repository build passed; it is **not** a claim that an external provider or legal workflow has been certified.

| Checklist item | Status | What changed | Remaining verification / decision |
| --- | --- | --- | --- |
| Dojah duplicate/retry protection | Partial | Per-user PostgreSQL transaction locking now returns a pending session for the same method instead of creating a second reference. A `PublisherVerificationAttempt` history preserves each reference; stale callbacks are recorded without overwriting the active verification. The UI says “Resume secure verification.” | **Blocked:** enable/test Dojah’s Resume Verification setting and confirm live webhook/result fields and NIN/BVN tier configuration. Migration is not applied. |
| Password reset and deactivation | Implemented, build/test verified | Added expiring, single-use reset challenges, hashed OTPs, refresh-token revocation, non-enumerating request responses, reset UI, and a self-service deactivation confirmation flow. JWT validation now rejects deactivated accounts. | Email provider configuration and end-to-end mail delivery/reset tests are still required. Account deletion/anonymisation needs a retention/legal policy. |
| Email delivery | Partial | Added an environment-gated Resend mail adapter and connected the notification worker and verification/reset flows. Production responses no longer expose codes. | **Blocked:** `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `EMAIL_FROM` must be configured; delivery/bounce/retry monitoring has not been tested. |
| Agent 18+ safeguard | Implemented, build/test verified | Agent registration and Google registration require a valid DOB and server-side 18+ check; tenants are deliberately exempt. Super-admin agent-role assignment also refuses an account without an adult agent profile. | Add boundary-date/integration tests and define a supervised DOB collection path before promoting an existing non-agent account. |
| Tenant rental-readiness questionnaire | Implemented, build/test verified | Applications now require a privacy-limited questionnaire (employment, income range/prefer not to say, move reason, contact preference, pets, smoking, business use, consent). It is visible only to the application’s landlord/agent and can be edited while pending. | No reusable profile, encryption-at-field level, retention/export policy, or browser authorization test yet. Do not add government IDs or bank data to this form. |
| Agreements | Partial | Added agreement/signature models, integrity hash, participant-only APIs, in-app read/download PDF, authenticated e-sign consent evidence, and signed-PDF upload/download paths. Agreement creation is wired to the confirmed-payment transaction; payout release remains separately gated by an approved tenancy. | **Blocked:** legal review of Nigerian agreement/signature wording; malware scanning; private R2 bucket/CORS verification; migration and full payment-to-tenancy E2E. Generated PDFs are rendered on demand, not stored as a canonical R2 object. |
| Tenant and landlord receipts | Partial | Added idempotent receipt records (`paymentId + kind` / `payoutId + kind`), authenticated lists/PDF downloads, tenant confirmation issuance after trusted payment success, and landlord issuance only when the payout flow marks a landlord payout paid. Receipt PDFs include fee/deduction details. | Paystack/webhook/payout sandbox and reconciliation tests are required. No receipt email is claimed until the email provider is configured and tested. |
| Property detail controls | Implemented, build verified | Added accessible image gallery with keyboard navigation, persistent saved-state lookup, save/unsave, native share with clipboard fallback, and video-tour navigation to the existing player. | Mobile/touch/browser and real R2 video playback tests remain. |
| Reviews, tenant ratings, disputes | Partial | Reviews are tenancy-bound and mutual: tenant → listing/landlord/agent; landlord/agent → tenant only after an ended tenancy. Detailed ratings, received-review view, disputes, moderation metadata, and basic summaries are wired. | Anti-retaliation/blind publishing, evidence/appeals, abuse rate limiting, moderator queues, and E2E/RBAC tests remain. |
| Reputation-aware discovery | Partial | Added an explicit **Recommended** sort. It uses published verified-tenancy reviews with a confidence-weighted 3.5 neutral baseline, so new/no-review properties are not penalised; normal search stays recent/relevance-first. | Add persistent aggregates, property standards, fairness/performance measurement, and monitoring before expanding its influence. |
| Prisma migration | Partial | Added `20261014160000_rental_trust_documents`, covering recovery, DOB, questionnaire, agreements/signatures, receipts, reviews, and verification attempts. `prisma validate` and client generation pass. | **Not applied** to any database; review in staging and back up before deployment. |

### Important evidence and limits

| Area | Evidence | Audit conclusion |
| --- | --- | --- |
| API wiring | `backend/src/main.ts` applies `/api/v1`, CORS, validation, and optional Swagger; module registration is in `backend/src/app.module.ts`. | API infrastructure is present and compiles. Production configuration was not inspected. |
| Automated tests | Only `pricing.service.spec.ts`, `password.service.spec.ts`, `kyc.service.spec.ts`, and `auth.schemas.spec.ts` exist. | Test coverage is narrow; a passing suite does **not** validate main user workflows. |
| External services | Paystack, Dojah, R2, Google Maps, Redis/BullMQ, and a notification queue are represented in code. | Their real configuration and live behaviour are unverified. |
| Email | `NotificationsService` queues email/in-app jobs, but `jobs/notification.processor.ts` only logs the job. | Email verification/delivery and receipt emails are not implemented end-to-end. |
| Local secrets | Local `.env` files exist but `git ls-files` shows no evidence they are tracked in this repository. | Do not commit, paste, or reuse values from local environment files. Rotate any key if it was exposed outside the intended secret store. |

### Role/workflow snapshot

| Role | Current code-backed capability | Status |
| --- | --- | --- |
| Tenant | Register/login, email verification logic, profile, save homes, apply, pay after approval/KYC, view transactions, maintenance, messaging, incident reports, and post-tenancy reviews. | Partial — several provider and post-payment requirements are incomplete. |
| Landlord | Publisher verification gate, create/manage listings, review applications, authorize escrow release, manage maintenance, bank payout flow, conversations, and transaction views. | Partial — agreement/receipt/reputation workflows absent; provider flows unverified. |
| Agent | Similar publisher/listing/application/payout workflow through managed listings. | Partial — no date-of-birth/18+ enforcement. |
| Admin | Users, listings, KYC review, payments/escrow/refund/caution operations, incidents, review moderation, dashboards, and audit-log surfaces. | Partial — needs E2E/RBAC and operational verification. |
| Super Admin | Administrator invitation, role selection, and permission-override UI/API paths are present. | Partial — permission boundaries must be tested with real accounts. |

## 2. Completed Features

These are the narrow set of features that have been **verified by the available automated build/test evidence**, rather than merely appearing in source code.

- [x] **Backend compilation** — Nest compiles successfully via `backend/package.json` → `nest build`.
- [x] **Frontend compilation and route generation** — Vinext successfully builds and pre-renders 52 routes via `package.json` → `vinext build`.
- [x] **Password hashing unit behaviour** — covered by `backend/src/common/auth/password.service.spec.ts`.
- [x] **Registration validation rules** — role allow-list and password/confirmation validation are covered by `backend/src/auth/dto/auth.schemas.spec.ts`.
- [x] **Pricing calculation unit behaviour** — covered by `backend/src/financials/pricing.service.spec.ts`.
- [x] **Legacy direct-NIN path is not started by the current KYC service** — covered by `backend/src/users/kyc.service.spec.ts`.

> The following sections intentionally do not call broader workflows “completed,” even where the source is extensive, because their real integrations and full journeys have not been tested.

## 3. Partially Completed Features

| Feature | Status | Current implementation | Outstanding work | Frontend | Backend | Database | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Authentication and sessions | Partial | Registration, login, Google token verification, JWT access tokens, refresh-token rotation, logout, email-verification challenge storage, password reset challenge storage, and guards exist in `backend/src/auth/`. Password reset and self-deactivation endpoints/UI now revoke active sessions. | Add abuse/rate-limit E2E tests, a retention/deletion policy, and real-provider delivery/retry/bounce tests. Test login/refresh/logout across devices. | Forgot/reset and deactivate flows are implemented; browser journey testing remains. | Reset/deactivation endpoints, audit trail, session revocation, and configurable mail provider are implemented. | `PasswordResetChallenge` added in the un-applied migration. | High |
| Role-based access control | Partial | `TENANT`, `LANDLORD`, `AGENT`, `ADMIN`, and `SUPER_ADMIN`, permission guards, admin role/permission surfaces, and seeded role paths exist. | Verify every endpoint/UI route with each role; document least-privilege defaults and separation of Super Admin duties. | Hide inaccessible controls consistently; role-specific acceptance states. | RBAC integration/negative tests and audit events for privileged changes. | Existing roles/permissions can be reused. | High |
| Tenant KYC / rent-payment gate | Partial | KYC status, encrypted NIN handling, service-fee records, payment gate, Dojah adapter, and tenant payment flow exist. | Confirm live Dojah/Paystack sequence, failed/abandoned charge handling, retry UX, support reconciliation, and receipt trigger after confirmed payment. | Clear status, retry, and charge disclosures. | Webhook/reconciliation E2E tests and provider error observability. | Existing KYC/service-charge models are reusable. | Critical |
| Landlord/agent EasyOnboard verification | Partial | Publisher verification stores a NIN/BVN method, Dojah reference/status/liveness state; the browser widget is opened in `features/landlord/publisher-verification.tsx`; the API reconciles server-side and validates signed webhooks. | Enable and verify the intended EasyOnboard widget configuration in Dojah; add lifecycle tests and operational monitoring. | Pending wording now prompts the user to resume securely; live-widget journey remains untested. | Verify webhook/event shape against live Dojah docs. | `PublisherVerificationAttempt` history is added in the un-applied migration. | Critical |
| **EasyOnboard Resume Verification** | Partial / safeguarded locally | A same-method pending session is returned under a per-user transaction lock instead of issuing a new reference. The UI offers “Resume secure verification”; historical references are retained and stale callbacks are audited without overwriting the active result. | Enable and test Dojah Resume Verification in its dashboard; confirm terminal/retry behaviour and the exact webhook contract. | Resume wording and pending-state protection are implemented. | Existing reference reuse, locks, attempt history, and stale callback protection are implemented. | `PublisherVerificationAttempt` is added but un-applied. | Critical |
| NIN/BVN tier identification | Partial / provider configuration gap | The application records only `NIN` or `BVN`; browser config passes only `widget_id`; no tier/plan/service SKU is persisted. | Confirm selected NIN/BVN product/tier, retry/resume setting, liveness inclusion, charges, and webhook contract in Dojah dashboard/docs. Persist a versioned provider configuration or service code with each paid attempt where needed. | Display only approved pricing copy from backend/configuration. | Avoid hard-coded cost claims; expose provider service metadata safely. | Add service-tier/config snapshot fields only if finance reconciliation requires it. | High |
| Listings and publisher workflow | Partial | Create/edit/submit/publish/moderate/archive logic, publisher gate, availability, managed listings, and dashboard API paths exist. `ListingsService`, listing wizard/editor, admin review, and publishing statuses are present. | Exercise creation → media → submit → moderation → publish with landlord and agent accounts; formalise property standards and rejection/rework flow. | Improve publisher status/rejection guidance and tested empty/error paths. | Workflow E2E tests, moderation SLA/audit rules. | Existing listing/status models reusable; standards evidence may require additions. | High |
| Media upload/storage | Partial | R2 presigned upload code validates ownership, MIME types, sizes, 3–4 images + exactly one video, and R2 object presence. The uploader uses real API calls. | Test real R2 CORS, upload expiry, deletion, broken-media recovery, video transcoding/performance, and access policy. | Upload progress/retry is present; add user-facing fallback for unavailable/processing video. | R2 integration tests, virus/malware/media moderation policy, image processing pipeline. | Existing `ListingMedia` reusable; add derivatives/processing status only if adopted. | High |
| Discovery, filters, maps, and Street View | Partial | Public listing search, area/bedroom filters, map/list toggle, saved coordinates, Google map, Places autocomplete, and Street View components exist. | Test Google API restrictions, quota errors, absent panorama behaviour, search relevance, and privacy of exact address/pin. | Existing loading/error states; add map-provider fallback and user guidance. | Search/ranking tests and API query performance tests. | Existing latitude/longitude fields reusable. | Medium |
| Favourites / saved homes | Partial | `SavedListing`, save/unsave endpoints, listing-card controls, saved-homes page, dashboard count, and a listing-detail saved-state endpoint now exist. | Integration-test idempotency and cross-device persistence. | Toolbar and title controls are wired with saved-state hydration; browser testing remains. | Dedicated authenticated saved-state lookup added. | Existing `SavedListing` composite unique relation reused. | Medium |
| Rental application / approval | Partial | Tenant form persists move-in date, lease length, occupation, occupants, message, and a mandatory application questionnaire; landlord/agent review shows the property-fit answers. | Validate lifecycle under concurrency, establish sensitive-data retention/redaction rules, and test manager authorization. | Questionnaire and review display are implemented; browser E2E remains. | Create/update validation and pending-only tenant updates are implemented. | Snapshot JSON fields added in the un-applied migration. | Critical |
| Payments, escrow, payouts, refunds, caution settlement | Partial | Payment initialization/verification, Paystack webhooks, payment/escrow/payout/ledger records, release authorization, refund/caution APIs, payout account UI, jobs, and idempotent PDF receipt records are present. | Live Paystack test, webhook replay/security test, reconciliation, payout failures/retries, bank-account validation, and real object/email delivery testing. | Payment/payout receipt list and authenticated PDF download are implemented. | Receipt creation is attached to confirmed tenant payment and actual landlord payout only. | `Receipt` added in the un-applied migration. | Critical |
| Tenancy lifecycle | Partial | A tenancy is created after confirmed payment, can be activated/completed by manager, releases listing availability at completion, and now creates an agreement. Activation remains gated by approved application state. | Add move-in evidence/checklist and tenancy transition E2E tests. | Agreements/documents are implemented; status timeline testing remains. | Agreement endpoints and participant authorization are implemented. | Agreement/signature models added in the un-applied migration. | Critical |
| Reviews and moderation | Partial | Verified tenants with ended tenancies can review listing, landlord, and applicable agent; landlords/agents can review tenants after completed tenancies. Reviews are tenancy-bound and have dimensions, disputes, moderation, and reputation summaries. | Add anti-retaliation/blind-publish policy, evidence/appeal workflow, aggregation jobs, quality signals, and abuse/fairness monitoring. | Rating forms, received reviews, and dispute submission are implemented; public summaries/browser E2E remain. | Eligibility, uniqueness, moderation, disputes, and bounded ranking are implemented. | Review tenancy/dispute/dimensions fields added in the un-applied migration. | High |
| Messaging / real-time notifications | Partial | Conversation/message/read-receipt models, Socket gateway usage, property-contact conversations, and persisted notifications exist. | Test socket authorization/reconnect, delivery failure, retention/reporting, and actual email provider. | Offline/reconnect/error states. | Message moderation/abuse controls and delivery provider. | Existing conversation/message/notification models reusable. | High |
| Property assistant | Partial (not generative AI) | `PropertyAiService` returns deterministic answers from listing fields and hands unknown questions to the property contact. It does not call an external AI model. | Decide whether this limited, factual assistant is the intended product. If expanding it, add grounded retrieval, safety, consent, monitoring, cost limits, and human handoff. | Clearly label capability/limits. | Provider abstraction/evaluation only if external AI is approved. | Conversation history already reusable; do not send sensitive KYC/payment data to an AI service. | Medium |
| Maintenance / incident reports | Partial | CRUD-style maintenance, attachments, manager workflows, incident report/investigation/resolution, and admin surfaces are in source. | Add E2E/RBAC tests, SLA/escalation policy, attachment scanning, and notification delivery verification. | Status history/support guidance. | Workflow test coverage and escalation jobs. | Existing models reusable. | Medium |
| Administration / Super Admin | Partial | Admin dashboard, user/listing/KYC/payment/escrow/refund/review/incident functions and Super Admin invite/permission paths exist. | Verify permission matrices, admin invitation/acceptance, audit-log completeness, operational exports, and production access controls. | Role-aware states and clear forbidden UX. | RBAC/E2E/audit tests. | Existing audit/permission models reusable. | High |

## 4. Missing Features

| Feature | Status | Current implementation | Outstanding work | Frontend | Backend | Database | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Tenancy agreement generation and access | Partial | A confirmed payment now creates a participant-authorized agreement with immutable terms snapshot, document hash, in-app read, and authenticated PDF download. | Legal review, canonical stored/signed final document policy, notification journey, R2 policy validation, and payment-to-tenancy E2E. | Agreement centre is implemented; user journey testing remains. | Template rendering, authorization, and audit events implemented. | Agreement/signature tables are in the un-applied migration. | Critical |
| Electronic agreement signing | Partial | Authenticated participants can record consented in-app signature with timestamp, IP/user-agent hash, signer role, and document hash. | Obtain legal approval for wording/evidence and test all lifecycle transitions. | Read-before-sign and signer status are implemented. | Signature validation and audit evidence are implemented. | Signature tables are in the un-applied migration. | Critical |
| Download-sign-upload agreement option | Partial | Participant-only PDF upload/download supports an agreement document category, ownership checks, MIME/size validation, and signed-copy metadata. | Add malware scanning, version/reviewer/completion policy, private R2 verification, and E2E. | Upload/download controls are implemented. | Signed upload authorization/policy implemented. | Agreement document fields in the un-applied migration. | Critical |
| Tenant payment receipt | Partial | Confirmed payment creates one idempotent tenant receipt with fee split, escrow status, property, reference, and authenticated on-demand PDF. | Reconciliation/backfill and Paystack webhook E2E. | Receipt list/download implemented. | Payment-success trigger and access checks implemented. | `Receipt` in un-applied migration. | Critical |
| Landlord escrow-disbursement receipt | Partial | Actual successful landlord payout creates one idempotent receipt; escrow authorization/scheduling does not. | Payout-provider E2E and reconciliation/backfill. | Receipt list/download implemented. | Payout-success trigger and access checks implemented. | `Receipt` in un-applied migration. | Critical |
| Tenant KYC questionnaire | Partial | A mandatory, non-discriminatory application snapshot covers employment, income range, reason, contact preference, pets, smoking, business use, and consent, alongside existing move-in/occupation fields. | Profile reuse decision, sensitive-data retention/redaction, encryption policy, and E2E. | Apply/review/edit controls are implemented. | Pending-only update and authorization validation implemented. | Application snapshot fields in un-applied migration. | High |
| Agent age ≥18 rule | Partial | Agent-only DOB is collected at registration and server validation rejects under-18 applicants; agent role assignment also requires a qualifying profile. | Privacy/retention policy and supervised process for legacy users who lack verified DOB. | Agent-only DOB input implemented. | Registration and role-grant enforcement implemented. | `AgentProfile.dateOfBirth` in un-applied migration. | High |
| Tenant ratings | Missing | `ReviewTargetType` supports only LISTING, LANDLORD, and AGENT; only tenants can author current reviews. | Let landlord/agent review verified completed tenancies with tightly scoped categories, timing and moderation. | Tenant review visibility, notification, response/dispute workflow. | Mutual eligibility, review window, anti-retaliation controls, moderation/dispute process. | Target type/author relationship extension; review-to-tenancy link and dispute data. | High |
| Reputation / property quality score | Missing | Individual reviews and admin listing moderation exist; no aggregates, property standards score, or landlord reputation model exists. | Design a transparent, confidence-weighted score with verified-tenancy-only inputs, recency, review volume, verified property-standard signals, complaints and moderation outcomes. | Explain score/confidence; avoid misleading ranking for new users. | Aggregation job/versioned formula and admin override/audit. | Cached aggregates/formula version/property-standard assessments. | High |
| Review-informed listing ranking | Missing | Listing search does not show a rating/reputation ranking pipeline. | Add ranking only after data-quality and fairness design: relevance/location/price/availability/completeness remain primary; use reputation as a bounded signal; cold-start neutral treatment. | Sorting/explanation and accessibility. | Search ranking implementation, measurement, abuse/fairness monitoring. | Search/aggregate fields if required. | Medium |
| Password reset | Partial | Secure hashed, expiring, attempt-limited reset challenges, confirmation endpoint, session revocation, and reset screens are implemented. | Add rate-limit E2E and live email-provider delivery/retry tests. | Forgot/reset pages implemented. | Token lifecycle and audit implemented. | `PasswordResetChallenge` in un-applied migration. | High |
| Account deactivation / deletion workflow | Partial | Authenticated self-deactivation changes account status and revokes refresh sessions; account settings exposes the action. | Define closure/retention, active-tenancy/payment restrictions, anonymisation/export, restoration, and support process. | Deactivate control implemented. | Deactivation and session revocation implemented. | Existing status plus audit; no deletion-request record yet. | Medium |
| Actual email sending | Partial | A configurable Resend mail adapter now sends verification/reset/notification email when credentials are supplied; disabled mode avoids disclosing codes or pretending delivery occurred. | Configure provider credentials/templates, delivery telemetry, retries, bounces, and live delivery tests. | Delivery/resend UX remains to be tested. | Provider adapter and worker invocation implemented. | Optional delivery-event records remain. | Critical |

## 5. Existing Bugs

| Feature | Status | Current implementation | Outstanding work | Frontend | Backend | Database | Priority |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Property detail: **View all photos** | Fixed locally / browser test pending | An accessible gallery/lightbox now opens all images with keyboard controls and ordered thumbnails. | Test touch/swipe, failed images, mobile focus, and real R2 URLs. | Gallery component/event handling implemented. | Confirm authorised public media URLs. | None required. | High |
| Property detail: **top toolbar favourite icon** | Fixed locally / integration test pending | The toolbar and title controls now share save/unsave state, hydrated from an authenticated saved-state endpoint. | Test idempotency and cross-device persistence. | Handler, loading/error state, and initial state implemented. | Dedicated saved-state lookup implemented. | Reuse `SavedListing`. | High |
| Property detail: **share icon** | Fixed locally / browser test pending | The share control uses native sharing with safe clipboard fallback. | Verify canonical routing and browser support. | Feedback/fallback implemented. | Verify public canonical URL/routing where needed. | None required. | Medium |
| Property detail: **video-tour gallery button** | Fixed locally / browser test pending | The gallery control scrolls to and opens the existing video player. | Verify media headers/CDN behaviour and slow/broken streams in real R2. | Button and player navigation implemented. | Verify media headers/CDN behaviour in real R2. | None required unless media processing status is added. | High |
| Publisher verification retry can duplicate paid identity checks | Safeguarded locally / provider test pending | Pending sessions are reused under a per-user lock, each reference is retained in history, and stale webhook results cannot overwrite the active session. | Enable/test Dojah Resume Verification and run provider-webhook E2E before treating the flow as finance-safe. | Resume/check-status wording implemented. | Preserve references, idempotency, webhook history implemented. | Attempt/session history in un-applied migration. | Critical |
| Notification email setting implies delivery that does not occur | Partial | A configured Resend adapter is invoked by notification jobs; disabled mode does not claim delivery. | Configure credentials, delivery telemetry, retries, bounces, and live tests. | Clarify channel availability/delivery state after provider testing. | Provider/worker implemented. | Optional delivery status remains. | High |
| Frontend build needs local prerender server permission in restricted environments | Environment limitation, not product bug | Build passed once allowed to bind a local loopback server; sandboxed build first failed with `EPERM` at `127.0.0.1`. | Keep CI environment compatible with Vinext prerendering. | None. | None. | None. | Low |

## 6. New Feature Requirements

This section translates the requested work into trackable delivery checklists. The implementation update near the top records delivered local work; unchecked items here remain required before production sign-off.

### 6.1 Tenancy agreement

**Reusable foundation:** `Tenancy`, `RentalApplication`, `Payment`, `Listing`, `AuditLog`, R2-style object storage patterns, authenticated participant checks, and notifications.

- [ ] Define the agreement trigger: normally a provider-confirmed successful rent payment, after escrow record creation, with a clear rule for rejected/reversed/refunded payment.
- [ ] Define agreement statuses at minimum: `PENDING_SIGNATURE`, `TENANT_SIGNED`, `LANDLORD_SIGNED` (if required), `COMPLETED`, `VOIDED`, and `SUPERSEDED`.
- [ ] Decide whether landlord signature is mandatory and whether the agent signs/acknowledges on the landlord’s behalf.
- [ ] Build a versioned agreement template with immutable populated snapshots: parties, property address, rent/fees, term, deposit/caution, start/end dates, rules, notices, and governing law.
- [ ] Generate a canonical PDF and store its hash/version; prevent silent replacement after any signature.
- [ ] Provide in-app reading and a download option for tenant and authorised landlord/agent.
- [ ] Implement **Option A** e-signature with explicit consent, signer authentication, document hash, timestamp, signer/verification evidence, IP/user-agent where lawful/appropriate, and audit history.
- [ ] Implement **Option B** download-sign-upload with versioned secure upload, MIME/size validation, malware scanning, reviewer/completion status, and a visible source-of-truth final document.
- [ ] Add user notifications at generation, signature requested, signed, completed, rejected/voided, and upload rejected states.
- [ ] Obtain Nigerian legal advice before presenting a signature flow as legally enforceable; ensure compliance with the Evidence Act, relevant electronic-transaction requirements, privacy law, retention, and consent notices. This is a product/legal decision, not a code-only task.
- [ ] Add service, API, permission, document-integrity, and E2E tests for all state transitions.

### 6.2 Automatic payment receipts

**Reusable foundation:** `Payment` holds the fee breakdown/reference/timestamps; `EscrowRecord` and `Payout` represent held and paid-out funds; `LedgerEntry` can support reconciliation.

- [ ] Create a single, immutable receipt domain with separate types: `TENANT_PAYMENT` and `LANDLORD_DISBURSEMENT` (and optionally agent/refund/caution receipts later).
- [ ] On **confirmed successful tenant payment**, issue exactly one tenant receipt. State that relevant funds are held in escrow and include tenant, property, landlord where appropriate, rent, platform fee, agent fee, caution, total, date, reference, provider/status, and receipt number.
- [ ] On **confirmed landlord payout paid**, issue exactly one landlord receipt. Include landlord, property, gross rent, deductions, net paid, payout/disbursement date, reference, status, and receipt number.
- [ ] Do not issue a landlord receipt when escrow is merely authorised or scheduled; require actual payout confirmation.
- [ ] Build PDF rendering, secure object storage, dashboard payment-history list, in-app viewer, download, and role-based access.
- [ ] Make event handlers idempotent and backfillable; reconcile against Paystack webhooks and payout job status.
- [ ] Decide email delivery only after the email provider is actually implemented.
- [ ] Add content, authorization, idempotency, retry, and provider-webhook E2E tests.

### 6.3 Tenant KYC questionnaire

**Recommended approach:** keep the profile reusable but take a read-only snapshot when an application is submitted. This lets tenants update future applications without changing what a landlord reviewed for a prior decision.

**Mandatory at application time** (minimise friction and discrimination):

- [ ] Occupation / primary activity (existing field can be reused).
- [ ] Employment status: employed, self-employed, business owner, student, other.
- [ ] Intended move-in date (existing application field).
- [ ] Intended lease duration (existing application field).
- [ ] Intended number of occupants (existing application field).
- [ ] Pets: yes/no/prefer not to say where legally/policy appropriate; do not infer protected traits.
- [ ] Smoking: yes/no/prefer not to say.
- [ ] Whether they intend to operate a business from the property: yes/no, only to assess property-rule compatibility.

**Optional and carefully limited:**

- [ ] Previous-rental history, length of prior residence, and non-sensitive reason for leaving.
- [ ] Previous-landlord reference contact, only with consent and clear visibility/use explanation.
- [ ] Monthly income **range** and rent funding/source, clearly optional; never require account statements in this workflow without separate policy/consent.
- [ ] Special accommodation requirements and “anything else” free text; protect access and avoid making disclosure a selection criterion.

- [ ] Do not collect protected-class, health, religion, ethnicity, marital/family-status, or other discriminatory-selection data unless there is a lawful, necessary, reviewed basis.
- [ ] Give tenants profile review/update controls and explain which completed applications retain historical snapshots.
- [ ] Give only the relevant landlord/managing agent access after application submission; prevent unrelated property owners and staff from broad browsing.
- [ ] Define access audit, retention/deletion, encryption/sensitive-field handling, redaction, export, and consent requirements under Nigerian privacy obligations.
- [ ] Add validation, authorisation, data-minimisation, and tenant/manager E2E tests.

### 6.4 Reviews, ratings, reputation, standards, and ranking

- [ ] Keep the current verified-tenancy rule; bind every review to a specific tenancy with a uniqueness constraint per author/target/tenancy.
- [ ] Expand property review categories: condition, cleanliness, description accuracy, maintenance, utilities/facilities, and overall experience.
- [ ] Preserve a separate overall written review; require factual guidance and offer report/moderation pathways.
- [ ] Add landlord/agent-to-tenant reviews only after a verified completed tenancy and a defined review window. Categories: timely payments, property care, agreement compliance, communication, overall tenancy experience.
- [ ] Apply anti-retaliation protections: simultaneous/blind publication until both window ends or both parties submit; no immediate counter-review visibility; rate limits; no edits after publication except a separately logged response/correction policy.
- [ ] Provide tenant notification, a meaningful dispute process, evidence submission, moderator decision, appeal/audit trail, and exclusion of removed/invalid reviews from scores.
- [ ] Keep **property verification/standards** distinct from tenant satisfaction. A moderation/standards pass is a quality signal; it is not a tenant rating.
- [ ] Use a confidence-aware landlord/property reputation formula, not a simple average: verified review count, Bayesian/weighted baseline, recency, category scores, completed-tenancy evidence, property-standard outcomes, resolved complaints, and moderation validity.
- [ ] Treat no-review/new landlord score as neutral with a “new/no rating yet” label; never penalise lack of history.
- [ ] Version the formula, cap its effect on search ranking, log recalculations, and provide internal explainability/moderator override with audit.
- [ ] Rank listings primarily by search relevance, location, availability, price/budget relevance, completeness, verified standards, and property quality; use reputation as a bounded secondary signal and test fairness/cold-start impact.
- [ ] Add aggregation jobs, dashboards, moderation queues, public summaries, API contracts, performance tests, and abuse monitoring.

### 6.5 Agent-only minimum-age rule

- [ ] Capture date of birth only in the agent registration/verification path; do not add an equivalent tenant age restriction.
- [ ] Calculate age server-side from date of birth at the relevant date; reject agent registration/activation/verification if under 18.
- [ ] Mirror the check in the frontend solely for early feedback; backend remains authoritative.
- [ ] Restrict DOB access, include privacy/retention policy, and audit modifications.
- [ ] Cover local, Google, role-change, and verification paths with boundary-date tests.

### 6.6 Property-details experience

- [ ] Add the image lightbox/gallery and wire `View all photos`.
- [ ] Wire the duplicate/top favourite icon; hydrate actual saved state and retain the existing saved-homes page/API.
- [ ] Implement native share plus copy-link fallback and canonical property URLs.
- [ ] Wire `Video tour included` to the existing video player/modal, with streaming loading/error fallback.
- [ ] Add desktop/mobile accessibility tests: keyboard focus, escape, screen-reader labels, and touch swipe/navigation.

## 7. Recommended Development Roadmap

### Phase 0 — Release safety and observability (before more user-facing promises)

- [ ] Configure real email delivery or remove/label nonfunctional email preference claims.
- [ ] Confirm production environment configuration, CORS, domain/callback URLs, webhook secrets, and whether Swagger is intentionally public in production.
- [ ] Set up error monitoring, queue monitoring, provider/webhook logs with redaction, backup/restore checks, and operational runbooks.
- [ ] Add API integration and browser E2E tests for auth, listings, applications, payment state, access control, and media upload.
- [ ] Resolve the Dojah duplicate-session/retry risk before exposing retry-heavy verification UI.

### Phase 1 — Complete the trustworthy property journey

- [ ] Fix property-detail gallery, top favourite, share, and video-tour controls.
- [ ] Validate real R2 upload/playback, Google Maps/Street View failure states, listing moderation, and property accuracy standards.
- [ ] Deliver agent-only age enforcement.
- [ ] Add the tenant KYC questionnaire profile plus application snapshots and manager review screen.

### Phase 2 — Payment confidence and post-payment documents

- [ ] Validate Paystack payment/webhook/escrow/release/payout/reconciliation in sandbox then controlled production.
- [ ] Deliver tenant payment receipt first (after confirmed payment), then landlord disbursement receipt (after payout is actually paid).
- [ ] Deliver tenancy agreement generation, read/download access, e-signature and download-sign-upload paths, with legal review before launch.

### Phase 3 — Complete tenancy and support operations

- [ ] Verify activation, move-in, maintenance, caution settlement, incidents, refunds, and tenant/landlord notifications end-to-end.
- [ ] Complete actual email delivery and operational support tooling.
- [ ] Strengthen Super Admin/RBAC audits and privileged-action testing.

### Phase 4 — Reputation and marketplace quality

- [ ] Expand reviews to category-based property/landlord feedback and moderated tenant feedback.
- [ ] Add review disputes, anti-retaliation controls, quality/standards signals, and transparent aggregate reputation.
- [ ] Roll out bounded rating-aware search ranking only after data volume, fairness, and abuse safeguards have been measured.

### Phase 5 — Optional assistant/AI evolution

- [ ] Keep the current property assistant factual and grounded while core trust workflows mature.
- [ ] If generative AI is approved later, design it as assistive—not a decision maker—for listing Q&A, media quality checks, and support triage, with consent, cost limits, human review, and no use of sensitive KYC/payment data.

## 8. Priority Breakdown

### Critical

- [ ] Prevent duplicate/resubmitted Dojah EasyOnboard verification sessions and use the provider’s approved resume behaviour.
- [ ] Test/configure the complete payment → escrow → payout/webhook/reconciliation path.
- [ ] Implement actual email delivery or remove claims that email notifications/verification emails are delivered.
- [ ] Build tenant payment receipts and landlord post-disbursement receipts with idempotent trigger rules.
- [ ] Build legally reviewed tenancy-agreement lifecycle, secure documents, and signing/upload flows.

### High

- [ ] Add tenant questionnaire with privacy-aware reusable profile + immutable application snapshots.
- [ ] Add agent-only 18+ server-side enforcement.
- [ ] Fix gallery, favourites, share, and video-tour controls.
- [ ] Finish review/reputation foundation, tenant reviews, disputes, moderation and tenant ratings.
- [ ] Add password reset; validate RBAC/admin/provider/media workflows through integration/E2E tests.

### Medium

- [ ] Improve search/relevance, maps/Street View resilience, and property-quality ranking after trusted review data exists.
- [ ] Account deactivation/data-retention workflow.
- [ ] Expand deterministic property assistant only with approved safety and privacy design.

### Low

- [ ] Ensure CI supports frontend prerender’s temporary loopback listener.
- [ ] Polish optional discovery/share/gallery UX after critical trust and compliance work is complete.

## 9. Dependencies and Technical Considerations

### Existing reusable building blocks

| Proposed work | Reusable components/models/services |
| --- | --- |
| Agreements | `Tenancy`, `RentalApplication`, `Listing`, `Payment`, `AuditLog`, authenticated participant checks, R2 patterns in `MediaService`. |
| Receipts | `Payment`, `EscrowRecord`, `Payout`, `LedgerEntry`, payment references/timestamps, `NotificationsService`. |
| Questionnaire | `TenantProfile`, `RentalApplication`, profile settings, manager application view, Zod DTO patterns, Prisma field encryption pattern. |
| Ratings | `Tenancy`, current `Review`, `IncidentReport`, admin moderation and audit/permissions paths. |
| Favourites | `SavedListing`, listings save/unsave APIs, `ListingCard`, saved-homes portfolio. |
| Media/gallery/video | `ListingMedia`, `MediaService`, listing uploader, existing inline `<video>` component. |
| Verification resume | `PublisherVerification`, Dojah adapter/reconciliation/webhook paths; needs a session-history extension rather than overwriting the current record. |

### Technical design rules

1. **Events must be idempotent.** A payment webhook, manual verification, queue retry, or payout retry must never create duplicate receipts, agreements, charges, payouts, or signatures. Use durable event/unique keys and reconciliation jobs.
2. **Use authoritative provider outcomes.** Browser callbacks should only trigger server reconciliation; Paystack/Dojah webhooks/results and signed server-to-server checks determine final state.
3. **Separate immutable records from editable profiles.** Agreement versions, signed documents, receipt PDFs, payment facts, and application questionnaire snapshots must not silently change when a user edits a profile or listing later.
4. **Minimise sensitive data.** Questionnaire financial/personal fields, DOB, NIN/BVN-related state, identity evidence, and signed documents need least-privilege access, encryption where appropriate, redaction in logs, retention rules, and audit events.
5. **Preserve financial state machines.** Do not infer “paid” from a browser redirect. Do not infer “landlord paid” from escrow release authorisation. Receipt triggers must follow confirmed database/provider states.
6. **Protect fairness.** Review eligibility must come from actual completed tenancies. New landlords/tenants need neutral treatment; rating/reputation should be explainable, disputeable, and a limited ranking signal.
7. **Treat configuration as deployment work.** Dojah widget configuration (NIN/BVN service tier, liveness, Resume Verification), Paystack callbacks/webhooks, R2 CORS, Google API restrictions, Redis workers, CORS origins, and email delivery require environment-specific verification outside source inspection.
8. **Keep the public API/documentation intentional.** `main.ts` serves Swagger when `SWAGGER_ENABLED` is true. Decide deliberately whether production `/docs` should be publicly exposed, authenticated, or disabled.

### Suggested test matrix before production claims

- [ ] Tenant: register → delivered email OTP → verify → browse/map/gallery/share/save → application/questionnaire → approval → KYC → Paystack success → receipt → agreement → tenancy → maintenance → review.
- [ ] Landlord: verify/resume safely → media upload → moderation/publish → review questionnaire → approve → escrow release → confirmed payout → landlord receipt → agreement access/signature → review/dispute.
- [ ] Agent: under-18 rejection; 18+ verification/listing/managed application/payout authorization.
- [ ] Admin/Super Admin: unauthorised access denied; permissions override works; listings/KYC/reviews/incidents/escrow actions create audit logs.
- [ ] Reliability: duplicate click, duplicate webhook, late Dojah callback, failed upload, Paystack timeout, payout retry, email provider failure, queue restart, and expired signed URL.
- [ ] Accessibility/security: keyboard gallery/modal, screen-reader labels, CSRF/auth/session handling, rate limits, sensitive-data log scan, and document download authorization.

### Source references consulted

- Frontend: `features/listings/pages.tsx`, `features/listings/listing-card.tsx`, `features/homes/portfolio.tsx`, `features/rentals/rental-flow.tsx`, `features/rentals/manager-applications.tsx`, `features/rentals/transaction-history.tsx`, `features/landlord/publisher-verification.tsx`, `features/reviews/reviews-hub.tsx`, `features/maps/`, `features/media/listing-media-uploader.tsx`, `lib/api.ts`.
- Backend: `src/main.ts`, `src/app.module.ts`, `src/auth/`, `src/users/`, `src/listings/`, `src/media/`, `src/applications/`, `src/payments/`, `src/tenancies/`, `src/reviews/`, `src/conversations/`, `src/notifications/`, `src/admin/`, `src/incidents/`, `src/jobs/`.
- Database: `backend/prisma/schema.prisma`.
- Tests: `backend/src/**/**.spec.ts` (four suites only).

---

**Audit conclusion:** SingleRent is beyond a visual prototype—the main domain scaffolding is connected in source and both projects compile—but it is not yet safe to describe the full rental lifecycle as production-complete. The next safe sequence is: provider/notification reliability and Dojah retry safety; fix property-detail controls; add the privacy-conscious tenant questionnaire and agent age rule; then implement receipts and legally reviewed agreements; finally expand reviews/reputation/ranking after verified tenancy data and moderation controls are in place.
