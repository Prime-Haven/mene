# Roadmap

- [x] Secure operator authentication and approval workflows
- [x] Add transactional 14-day trial onboarding and address suggestions
- [x] Complete homepage verse, review marquee, and footer
- [x] Harden billing, subscription renewal, and space purchases
- [x] Route application email through connected Resend
- [x] Verify public onboarding, address uniqueness, password rules, package-gated leader access, operator console, and Billing fallback
- [ ] Confirm a real Paystack subscription renewal — live key is saved; webhook configuration and an owner-approved payment are still required
- [ ] Confirm live Resend delivery — the updated send-only key is connected; a verified menelog.site sending domain and recipient test are still required
- [ ] Submit and approve a real church review — blocked until a church administrator signs in on/after the 30th

## Current request — 2026-09-23
- [x] Require email verification after successful onboarding before trial or paid access
- [x] Fix onboarding completion failure
- [x] Update Resend credentials and verify email path
- [x] Add Paystack live credentials and verify payment integration
- [x] Add privacy-safe live homepage platform statistics
- [x] Add smooth transitions and subtle moving blur background
- [x] Add public Ask Mene:Log product-help assistant
- [x] Rename the platform everywhere to Mene:Log
- [x] Keep the homepage Ask Mene:Log button fixed at the viewport's bottom-right

## Tiered account dashboard redesign — 2026-09-23
- [x] Restyle the signed-in shell using the supplied compact operations-dashboard reference
- [x] Redesign the dashboard with compact controls, KPI tiles, charts, and useful empty states
- [x] Preserve Basic, Standard, and Premium feature visibility and limits
- [x] Verify desktop and mobile layouts, motion, navigation, and browser stability

## System audit — 2026-09-23
- [x] Remove legacy master-password login from the database
- [x] Confirm payment/space webhooks are replay-safe; retire unguarded old space function
- [x] Constant-time cron secret, Mene:Log cron names, error status on failure
- [x] Trust only edge IP for public help rate limit; revoke visitor access to internal functions
- [x] February review prompt; keep personal details on signed-in onboarding path
- [ ] Paystack webhook setup + real renewal — needs owner to configure webhook in Paystack
- [ ] New features (giving, events, first-timer follow-up, exports, absence alerts, 2-step sign-in) — awaiting owner's pick

## New features — 2026-09-23
- [x] Attendance register with tick boxes (admins)
- [x] First-timer follow-ups (Standard/Premium) + leader view
- [x] Absence alerts on dashboard
- [x] Owner full data export (ZIP of CSVs, 3/hour)
- [x] Two-step sign-in (optional, church-required, always for Prime Haven operator)

## Standard tier upgrade — 2026-09-23
- [x] Check-in page hero redesign (bold church name + logo)
- [x] "Who invited you?" dropdown (Self / walk-in + leaders)
- [x] Auto-download QR after check-in
- [x] Re-openable member QR codes on Members page (+ ZIP)
- [x] Leader QR codes + leader attendance designation
- [x] Strict leader scoping + leader dashboard (demographics, absentees, contact logs, birthdays)
