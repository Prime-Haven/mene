# Mene: homepage, onboarding, leaders and admin upgrades

## 1. Homepage hero

- Remove "Every person matters." and the supporting paragraph.
- Replace with Daniel 5:25 as a looping typing animation: KJV, then NIV, then NLT, then TPT — each types out, holds, wipes, and the next begins. Same display font, size tuned so the longest translation still fits on mobile.
- Small caption under the verse showing the translation currently being typed.
- Hero headline, verse and both buttons (Create your church, See how it works) centred and centre-aligned.
- Typing pauses into a static verse when a visitor has reduced-motion turned on.

## 2. Footer, terms and privacy

- New footer across the homepage: Mene mark, short line, links (Features, Plans, FAQ, Terms of Use, Privacy Policy, Sign in), Prime Haven IT Solutions & Consultancy credit, year.
- New public pages: Terms of Use and Privacy Policy, written from how the system actually works — church-owned data, per-church isolation, subscription and billing terms, acceptable use, member-code and check-in rules, cancellation and data retention.
- Privacy Policy states plainly: the platform operator (Prime Haven) sees only registered church accounts, their package, status and billing health — never member names, contacts, birth dates, attendance rows or messages. Only the church's own administrators and permitted staff can see member records.

## 3. Church sign-up becomes guided onboarding

"Start free" / "Create your church" leads into a multi-step flow with a progress indicator:

1. About you — full name, email, phone, your location
2. Your church — church name, church location/city, contact email and phone, check-in link name
3. Your plan — Basic / Standard / Premium
4. Security — password and confirm password

Password rule everywhere (sign-up, leader registration, password change): 8–16 characters, at least one uppercase, one lowercase, one number and one symbol, shown as a live checklist with a strength meter.

## 4. Monthly review prompt and homepage carousel

- On the 30th of each month, a review dialog appears once for each church administrator: star rating plus a short written review. Dismissible, reappears next month if skipped, and each admin may submit only one review ever.
- Reviews land in your console for approval; approved reviews replace the placeholder quotes in "Churches thrive through people" and run as a continuous horizontal marquee that pauses on hover.

## 5. Member self check-in page

Fields, in order: service (already above), full name, phone, email (optional), date of birth, gender (male or female only), marital status, location, occupation, educational level, who invited you / name of leader — picked from the church's registered leaders.

After submitting: the member's QR code downloads automatically where the browser allows it. If not, the code is displayed full-size with clear instructions — "press and hold the image, then Save to Photos" for iPhone, "tap and hold, then Download image" elsewhere — plus a Save button and share sheet.

## 6. Leaders (Standard and Premium)

- On the check-in page, a "Leader area" panel with Log in or Register.
- Leader registration steps: full name, email, phone, profile photo, date of birth, location, type of leader (list defined by the church admin), the church's leader access code, then password and confirm password.
- The access code blocks spam registrations; the church admin sets and can regenerate it.
- Email verification link is sent; a leader can only sign in after verifying. Dormant until the email key is added — until then the admin can approve a leader manually.
- Leader account shows their own members: how many people chose them, plus that list with the detail their role allows.
- Admin sidebar gains Leaders (Standard and Premium): manage leader types, set the access code, approve or suspend leaders, see member counts per leader.

## 7. Services, Ask Mene, extra space, private operator door

- Services: full create, rename, reschedule, open/close and delete on every package, with a confirmation that warns when attendance already exists.
- Ask Mene: the reported error is not yet diagnosed. First step is reproducing a real question against a signed-in admin account, reading the server response, then fixing the cause and re-testing end to end.
- Standard and Premium get a "Request more member space" action: choose a capacity add-on and pay for it immediately, which raises the church's member limit on success. The payment step stays dormant until the Paystack key is added, and the request is recorded so you can also grant it manually meanwhile.
- A private operator entrance at `/super-admin` with its own sign-in screen, not linked from anywhere public and not indexed. Signing in with your operator credentials opens the church-accounts console. The general sign-in page will no longer route you into the operator area.

## 8. Scale and safety

- Indexes on the columns that check-in, attendance reporting, member search, leader lookups and reviews actually filter on, so busy Sundays stay fast as records grow.
- Aggregated counts read from prepared summaries rather than scanning full tables.
- Every new table gets strict per-church access rules and explicit grants; leader access is limited to their own members; every new write path is server-validated, rate-limited and length-capped.
- Check-in, leader registration and review submission all get their own rate limits per church and per device.

## Technical notes

- Typing hero: small reduced-motion-aware component in `src/routes/index.tsx`; verse text kept as a constant array.
- New routes: `src/routes/terms.tsx`, `src/routes/privacy.tsx`, `src/routes/super-admin.tsx` (operator sign-in wrapping the existing `platform` console), `src/routes/_app/leaders.tsx`, expanded `src/routes/onboarding.tsx` as a stepped form.
- Migration adds: `church_reviews` (one per admin, approval flag), `leader_types`, `leader_profiles` linked to `tenant_users` with role `leader`, `tenant_leader_access_code`, `member.invited_by_leader_id`, `member.education_level`, `member_capacity_addon` and `space_requests`, plus supporting indexes and RLS/grants. Additive only — existing columns stay.
- Leader auth uses Cloud email/password with email confirmation; the leader access code is verified server-side inside a server function before the account is attached to the church.
- Capacity top-up flows through the existing Paystack payment route and raises an additive `extra_member_slots` column on the tenant when a payment succeeds.
- Ask Mene fix begins with a reproduction against `/api/public/ask-mene` and the streaming client wiring; the aggregate-only privacy boundary and rate limits remain unchanged.
- Password policy lives in one shared validator used by sign-up, leader registration and password changes.
