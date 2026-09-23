# Mene:Log system audit — fixes and new features

## Critical (fix first)

1. **Old master-password backdoor is still live in the database.** The `master / Money@2026` login table and its check function still exist and anyone can call them, even though the operator page no longer uses them. Drop the table and both functions (`verify_super_admin_credentials`, `set_super_admin_password`), and delete `supabase/standalone_migration.sql` so they can't come back.
2. **Payment replay safety.** Confirm that the payment and extra-space functions skip a Paystack reference they've already processed. If they don't, add a unique processed-reference guard so a replayed webhook can't extend a subscription twice.
3. **Configure the Paystack webhook** to `https://mene.lovable.app/api/public/webhooks/paystack`, then run one real renewal and check the payment, end date and Billing page all agree.

## Security hardening

- Cron endpoint: compare its secret in constant time (as the webhook already does), and rename `PATMOS_CRON_SECRET` / `x-patmos-cron-secret` to Mene:Log names.
- Public help assistant: rate-limit only by the trusted Cloudflare IP header and ignore anything the client sends in `x-forwarded-for`.
- Rate-limit public stats by IP and cache the result for about 5 minutes, and round the displayed numbers.
- Audit every function anonymous visitors can call and remove access to any the public pages don't need.
- Make sure every backend function that runs with raised permissions sets a fixed search path and checks the caller's church/role (run the linter and security scan after the changes).
- The database structure isn't saved in the project. Export it into tracked migration files so future reviews are complete.

## Data-flow inconsistencies

- Onboarding while already signed in skips the location and church-phone fields. Send every collected field in both onboarding paths.
- Remove leftover "Mene"/"Patmos" wording (migration comments, cron names).
- Keep one list of what each package includes: have the browser read the database's package rules, or add a test that fails when the two lists differ.
- Refresh Billing, Leaders, reviews and the operator lists right after every change (invalidate cached data).
- The built-in backend address fallback: keep it for the published site, but log a warning when it's in use so a future staging setup can't quietly point at production.

## Bugs

- **Review pop-up never appears in February.** Change the rule to "the 30th, or the last day of the month when it's shorter", using the church's time zone rather than the viewer's device.
- The cron job returns success even when automations fail. Return an error status so monitoring can catch it.
- Replace the deprecated server-function validator calls in the check-in and leader modules.
- Add error and loading states wherever an action can fail without showing anything.

## Suggested new features

- **Giving**: tithes/offerings records per member and service, with reports (Standard+).
- **Events**: one-off events and conferences with their own check-in, separate from regular services.
- **First-timer follow-up**: a pipeline of new visitors assigned to leaders, with automatic welcome messages.
- **Self-service export**: full church data export (members, attendance) as CSV from Settings.
- **Member self-service**: members view their own attendance history from their QR link.
- **Absence alerts** on the dashboard: members who have missed several Sundays.
- **Operator health**: a failed-payments and failed-email-delivery list in `/super-admin`.
- **Two-step sign-in** for church owners and the Prime Haven operator.

## Verification

- Security scan and database linter come back clean; the backdoor function no longer exists.
- Replaying the same signed webhook twice changes the subscription only once.
- Onboarding (both paths) saves every field; the review prompt appears on Feb 28 under simulated dates.
- Browser pass of the homepage, onboarding, dashboard, Billing and `/super-admin` shows no errors.
