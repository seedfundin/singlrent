# Phone verification and transactional NIN checks

Registration requires a phone number and creates an authenticated session, then issues a six-digit SMS OTP. Email is optional at registration. In development, the response from `POST /api/v1/auth/register` and `POST /api/v1/auth/phone-verification` includes `phoneVerification.developmentCode`. Production must configure Termii before a customer can complete account verification.

Confirm the code with `POST /api/v1/auth/phone-verification/confirm`. An unverified account can browse and sign in, but cannot start payment, identity verification, or a payout withdrawal.

NIN is deliberately not collected during registration. A verified NIN is reused forever for that user unless the product later adds an explicit re-verification policy.

## Tenant: first rent payment

1. `POST /api/v1/payments/initialize` returns `412` with `code: KYC_REQUIRED` until the user has a verified KYC profile.
2. Collect the NIN in that checkout and call `POST /api/v1/users/me/kyc/service-charge`.
3. The response starts a distinct Paystack payment for the ₦100 (`10000` kobo) **service fee**.
4. After Paystack confirms that fee, the webhook calls Dojah. For local callback testing, call `POST /api/v1/users/me/kyc/service-charge/:chargeId/verify` after Paystack has completed the charge.
5. Dojah success sets KYC to `VERIFIED`; Dojah rejection leaves it `REJECTED`. The ₦100 is paid either way, because it pays for the provider request. The tenant can then initialize the normal rent payment, without another NIN fee.

## Landlord or agent: first withdrawal

1. Escrow release creates a `PENDING` payout; it does not automatically transfer money.
2. The recipient calls `POST /api/v1/payouts/:payoutId/withdraw`. A verified user can withdraw immediately.
3. An unverified recipient supplies a NIN with that request. The system adds a ₦100 service fee to that payout and calls Dojah.
4. On success, the payout is scheduled and the transfer sends the payout less the accumulated service fee. On rejection or provider failure, the payout stays pending but the ₦100 charge remains recorded; another Dojah request creates another fee.

This keeps every paid provider request, success, rejection, and provider failure auditable in `verification_service_charges` without returning a full NIN to the browser.

## Landlord and agent: before creating a listing

Landlords and agents can register, verify their phone number, and use their workspace normally. Before they can create a listing or submit an existing draft for review, they must complete a separate **publisher verification**. This is not charged through the tenant's transactional KYC flow.

1. Configure a published Dojah **EasyOnboard** flow which offers **both NIN and BVN** government-data checks and includes the **Liveness** fraud check.
2. Add `NEXT_PUBLIC_DOJAH_APP_ID`, `NEXT_PUBLIC_DOJAH_PUBLIC_KEY`, and `NEXT_PUBLIC_DOJAH_PUBLISHER_WIDGET_ID` to the frontend environment. These three values are safe to use in the browser; never put a Dojah secret there.
3. Keep `DOJAH_APP_ID` and `DOJAH_SECRET_KEY` on the backend. Add `DOJAH_WEBHOOK_SECRET` after subscribing Dojah's `kyc_widget` service to `POST /api/v1/users/webhooks/dojah`.
4. The user chooses NIN or BVN and completes the hosted Dojah liveness flow. SingleRent does not receive or persist the selected NIN, BVN, selfie, or the provider's identity payload.
5. A browser success callback is only used for feedback. The API fetches Dojah's authoritative verification record (and accepts signed `kyc_widget` webhooks) before it marks the publisher `VERIFIED`.
6. To unlock listing access, the provider result must be `Completed`, have a successful NIN/BVN government-data check, and have a successful liveness result. Any pending, failed, abandoned, mismatched-method, or incomplete-liveness result leaves listing access locked.

The frontend directs unverified publishers to `/verify-publisher`; the same gate appears automatically when they choose **Add a property**. The Listings API independently enforces the rule on both `POST /listings` and `POST /listings/:listingId/submit`, so bypassing the interface cannot create or publish a property.
