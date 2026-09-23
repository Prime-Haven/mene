# Complete Mene onboarding, operations, email and billing

## Outcome

Finish the public homepage and the remaining account flows, while tightening the operator and payment boundaries. New churches receive a 14-day trial, choose a permanent `menelog.site/c/name` check-in address, and pay from Billing before or when the trial ends.

## 1. Homepage completion

- Keep the Daniel 5:25 translation typer in the hero, centered with both calls to action and reduced-motion behavior.
- Change every church-creation call to action to the guided onboarding flow.
- Make approved church reviews move continuously across the “Churches thrive through people” section, pause on hover/focus, support touch, and fall back to a static row for reduced motion.
- Keep an intentional empty state when no reviews are approved so the section does not look broken.
- Mount the shared footer with Terms, Privacy, sign-in, and Prime Haven credit.
- Open the homepage at desktop and mobile sizes and confirm the verse, buttons, review section, footer, navigation, and console are error-free.

## 2. Four-step onboarding styled like the homepage hero

Use the existing worship visual as a full-screen background with the same dark treatment, typography, navigation treatment and restrained motion as the homepage. The form remains readable as the focused interactive surface.

1. **About you:** full name, email, phone, location.
2. **Your church:** church name, city/region, contact details, permanent check-in address.
3. **Your plan:** Basic, Standard or Premium, with monthly USD pricing and a clear 14-day trial message.
4. **Security:** password and confirmation with the shared live checklist and strength meter.

Remove the simulated payment step entirely. Provision the church and trial atomically after authentication; send unconfirmed accounts through the public confirmation-return flow before provisioning.

### Permanent check-in address

- Generate clean suggestions from the church name, plus city or short-number alternatives when needed.
- Show the full result as `menelog.site/c/<name>` and let the person edit the final segment.
- Use explicit idle, checking, available and taken states so a previous result is never shown for newly typed text.
- Check suggestions against all existing church addresses without exposing the church list.
- Re-check and claim the address inside the same database transaction that creates the church. Translate a simultaneous duplicate claim into a friendly “already taken” response.
- Remove the unsafe direct-table fallback that currently bypasses server validation and rate limits.
- Replace public-facing `mene.church` references with `menelog.site`, including legal/support copy where applicable; keep internal routes host-independent.

## 3. Secure `/super-admin` operations console

- Keep `/super-admin` as the only operator entrance and use the registered Prime Haven operator account.
- Remove the hardcoded master password, browser session-token fallback, and any client-side path that treats an arbitrary stored value as operator authentication.
- Protect every operator read and action with verified server-side operator status; no optimistic direct-table fallbacks.
- Complete church account management: search/filter, approve or reject pending registrations, edit plan/contact/address, suspend/restore, inspect billing health, and grant extra member space manually.
- Complete review moderation: pending, approved and rejected lists with approve/reject actions and immediate homepage refresh behavior.
- Keep the console aggregate-only: no member rows, contacts, individual attendance, messages, QR data, or church audit details.
- Move any currently standalone approval schema/functions into one tracked migration with explicit grants, RLS, validation, and operator audit events.

## 4. Billing, trial and extra member space

- Show trial status and expiry in Billing, alongside the current package and subscription period.
- Keep subscription checkout and Standard/Premium extra-space checkout as authenticated server actions.
- Record the pending purchase before redirecting, initialize Paystack with validated server-side amounts, and route successful signed webhooks by purchase type.
- Verify webhook amount, currency, reference and metadata against the stored purchase before applying it.
- Preserve idempotency: replaying the same event must not extend a subscription or add member slots twice.
- On subscription success, extend from the later of today or the current period end by one month, activate the paid package, and surface the updated date in Billing.
- On space success, mark the request paid and add the purchased slots exactly once.
- Add clear return states after checkout and refresh Billing data after success.

**Paystack checkpoint:** the key is not configured. The complete flow and tests will be prepared, but a real charge and webhook confirmation cannot be claimed until the key is securely added and Paystack is pointed to the published webhook URL.

## 5. Resend and leader verification email

- Link a Resend connection to this project after plan approval and update app email delivery to use the connector from server-side code only.
- Use a verified `menelog.site` sender for delivery to church users; preserve church branding and reply-to behavior.
- Keep provider failures visible in delivery status without exposing credentials or raw private data.
- Send and confirm one real application email after the sender domain is verified.
- Keep leader email verification on the managed authentication flow, because it is separate from broadcast email. Confirm leader registration creates the pending leader safely, emits the verification email, and permits sign-in only after verification.

## 6. End-to-end verification

- Walk onboarding with a new address suggestion, a known-taken address, a manually edited available address, all password-rule states, email confirmation, and trial creation.
- Confirm the created church opens at `menelog.site/c/<name>` in displayed links and at the equivalent preview route during local testing.
- Exercise the 30th-day review prompt using controlled test time/state, submit once, approve it from `/super-admin`, and confirm it appears in the homepage marquee.
- Register a leader with the church access code, confirm the email and sign in to the leader account; verify invalid codes, duplicate registration and unverified sign-in are rejected.
- Test subscription and extra-space webhook logic with signed test events, including wrong amount, invalid signature and duplicate delivery.
- Once the Paystack key is supplied, run one provider-backed test payment and confirm the payment row, subscription end date, church package and Billing UI all agree.
- Run focused automated checks, database security checks, and desktop/mobile browser verification. Confirm no `.env` file is tracked.

## Technical and security notes

- Validate every new input on both client and server with shared schemas and strict length/format limits.
- Database mutations remain tenant-scoped, rate-limited and transaction-safe; new or altered public tables/functions receive explicit grants and RLS.
- Availability checks are advisory only; the unique database constraint and transactional provisioning remain authoritative under concurrent registrations.
- Operator authorization uses the existing platform-admin role on the server, never local storage or a hardcoded credential.
- Payment secrets and Resend credentials remain server-only and are never committed to environment files.
- The real-payment verification item remains open only on the Paystack key and externally reachable webhook configuration.
