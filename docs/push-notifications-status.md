# Browser push implementation status

This feature is **not ready for production**. Keep `PUSH_NOTIFICATIONS_ENABLED=false`.

Implemented so far: a web-app manifest, encrypted FCM and standards-based Web Push device registration, account-scoped deletion, a per-device submission record, a queue-based sender, device and per-event controls, conversation throttling, and aggregate super-admin monitoring. Clicking a push retrieves the notification under the signed-in account and opens a relevant area of the app; signing in first retains the notification ID. Existing in-app records remain the source of truth. Provider acceptance is not proof of delivery. The user-visible payload is deliberately generic.

Before enabling: verify all event coverage, improve remaining detailed links, and run browser/device tests, including logout and account-switch handling and the Web Push fallback. Provider-confirmed payouts now notify their recipient, but notification creation happens after the financial transaction commits: an interruption at that point can still lose the notification. A transactional outbox would be needed for guaranteed handoff. Assess dependency audit findings and apply all pending migrations only after reviewing and backing up the intended database. No production Firebase configuration or provider test has been performed. Some deep links open the relevant dashboard rather than an individual record. Aggregate statistics do not prove notification display or clicks.

Backend environment names (do not commit actual values): `PUSH_NOTIFICATIONS_ENABLED`, `PUSH_DEVICE_ENCRYPTION_KEY` (at least 32 characters; retain securely because rotating it prevents decryption of registered devices), `FIREBASE_SERVER_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`, and `WEB_PUSH_VAPID_SUBJECT`. Browser build variables are listed in the root `.env.example`. Firebase web configuration is public; service-account credentials, Web Push private key, and the device-encryption key must remain on the backend.

An unavailable push provider must not affect SMS OTP. iOS web push requires a supported Home Screen web app. No Firebase hosting, database, authentication, or Cloud Functions are used.

SMS OTP challenges use a 10-minute expiry; public reset and verification endpoints are rate limited. The existing throttler is process-local, so distributed deployments need shared rate-limiting before claiming cluster-wide brute-force protection. Changing the JWT signing secret also invalidates outstanding password-reset OTPs.

## Safe rollout checklist

1. Back up the intended database and review **all** pending migrations, including existing unrelated migrations, before applying them. The notification categories migration is required by updated application events even while push is disabled.
2. Configure Firebase web messaging and a least-privilege backend service account. Configure a separate Web Push VAPID key pair for the standards-based fallback. The backend `WEB_PUSH_VAPID_PUBLIC_KEY` must match the frontend `NEXT_PUBLIC_WEB_PUSH_VAPID_KEY`; keep the private key server-side. Set a valid contact as `WEB_PUSH_VAPID_SUBJECT`.
3. Set the backend encryption key and provider values using the hosting provider's secret settings. Supply the public `NEXT_PUBLIC_*` values to the frontend build environment and rebuild the frontend. Never paste private keys or browser tokens into chat or source control.
4. Keep the flag off until testing is scheduled. Enable it in a staging backend only; make sure Redis and the existing notification worker are running. Enabling a provider is not proof of device delivery.
5. Test tenant, landlord and agent accounts on supported Chrome, Edge, Safari, Android and an installed iPhone Home Screen app. Check enable/deny/revoke, logout/account switching, background and foreground notifications, sign-in return paths, preference changes and actual relevant event destinations. Confirm no private content appears on the lock screen.
6. Review the super-admin aggregate monitor and provider logs. Test fallback behavior during a provider outage. Keep the in-app notification record available regardless of push delivery.

The push notification links open an authenticated section and, for property conversations, the matching conversation where it is in the loaded list. Payment, move-in verification, and inspection links scroll to the relevant record when it is present in the loaded page. Other links may still open a section rather than the specific record. Existing notification records and preferences remain intact.
