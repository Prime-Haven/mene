# Patmos: scalable data layer, tier wiring, email and SMS

## Goal

Make Patmos safe to sell: a hardened, scalable database; every Basic, Standard and Premium feature connected into one flow; and built-in email and SMS that switch on the moment you add your Resend and Arkesel keys.

## 1. One place that decides what each package includes

- A single entitlements definition (one file, mirrored by a database function) listing every capability: member registry, check-in, QR, services, branding, leadership structure, groups, email campaigns, multi-branch, SMS, automations, advanced reports, staff seat limits, member limits.
- Starting map (changeable in that one place later):
  - Basic — members, services, check-in and QR, branding, basic reports, email.
  - Standard — everything in Basic plus leadership structure, groups, email campaigns, richer reports.
  - Premium — everything in Standard plus multiple branches, SMS, automations, advanced reports.
- Every screen, menu item and server action checks the same definition, so the sidebar never shows a page the church cannot use, and the server refuses the action even if someone calls it directly.
- Locked features show a clear upgrade panel linking to billing instead of disappearing silently.

## 2. Security and data protection

- Every table gets row-level rules keyed to the church, so no church can ever read or touch another church's data; no policy queries its own table (avoids recursion).
- Every write goes through validated server functions and database functions with fixed parameters — no string-built SQL anywhere, so injection is not possible.
- Explicit table permissions for each new table, matching its policies; member and token tables stay unreadable to the public.
- Reads and writes are validated three times: in the browser, in the server function, and in the database function (length, allowed values, ownership).
- Rate limits extended to the new surfaces: broadcasts, invites, imports, exports, QR issuing, check-in, and login-adjacent actions.
- Audit trail extended to cover messaging, exports, member edits and deletes, role changes, branch changes and branding changes.
- Bulk member import moves off direct table writes onto a secure database function with per-row validation, duplicate matching and a capped batch size.
- Personal data: phone and email visible only to roles that need them, minors' contact details stay protected, and anonymise wipes every new field too.

## 3. Scalable database groundwork

- Indexes for the queries that grow: attendance by church/service/date, members by church/name/phone, messages by church/status/date.
- Attendance and member lists paginate instead of loading everything.
- Report figures come from database-side aggregates rather than pulling rows into the browser.
- Counters and limits (member count, staff seats) read from the database, not guessed in the UI.

## 4. Connecting every feature into one flow

- Service created → appears on the church's public check-in page → visitor registers → member record created → attendance recorded → QR issued → welcome message queued.
- Returning visitor scans QR → attendance recorded against the open service they picked → dashboard, reports and follow-up lists update.
- Leadership structure (Standard) → positions assigned to members → leaders see only their own group's members and reports → group-level attendance figures.
- Branches (Premium) → services, members, staff and reports scoped to a branch → branch admins confined to their branch → church-wide roll-up for owners.
- Groups (Standard) → member grouping used as the audience filter for email and SMS, and for group attendance reports.
- Billing → package change immediately widens or narrows features, staff seats and messaging; downgrades keep data but lock the screens.
- Every dependency is enforced, with plain-language guidance: no check-in without an open service, no leader role without a position, no branch role without a branch, no broadcast without a saved audience.

## 5. Email (Resend) and SMS (Arkesel)

Built now, dormant until you paste the keys; every screen shows a clear "messaging not configured yet" state until then.

- A message queue table: church, channel, recipient, template, content, status, provider ID, error, timestamps, plus per-church monthly send counters.
- Sending happens server-side only; keys are never exposed to the browser. Delivery outcomes (bounces, complaints, failures) are recorded against the message and the member.
- Templates carry church branding: logo, name, colours, signature.
- Automatic messages:
  - Welcome after first check-in, including the member's QR code.
  - Birthday wishes, once daily.
  - Absence follow-up when a member misses a set number of services, sent to the member and/or flagged to their leader.
- Manual broadcasts: compose, pick an audience (all, branch, group, first-timers, absent, birthdays this month), preview, send, and see per-recipient delivery results.
- Staff invitations become branded emails with the church's logo and name.
- Per-church opt-out honoured on every send; members can be excluded from messaging.
- Safety rails: quiet-hours guard, per-church daily caps, retries with backoff, and no duplicate sends for the same trigger.

## 6. Verification

- Test as each demo church (Basic, Standard, Premium) end to end: create service, register a visitor publicly, save the QR, scan it back, check dashboard and reports, change branding, invite staff, run a broadcast in dry-run.
- Confirm a Basic church cannot reach Standard or Premium screens or actions, and a leader cannot see other groups.
- Confirm no church can read another church's members, services, attendance, messages or files.
- Confirm messaging shows the unconfigured state cleanly and queues nothing until keys exist.

## Technical notes

- All schema changes additive; new tables get grants, row-level security and policies in the same migration.
- Entitlements enforced both in a shared TypeScript map and a security-definer SQL helper so client and server never disagree.
- Sending runs through server functions; provider callbacks land on a signature-verified public webhook route.
- Scheduled work (birthdays, absence follow-up) uses one low-frequency daily job rather than several pollers.
- Secrets `RESEND_API_KEY` and `ARKESEL_API_KEY` requested when you are ready; nothing hardcoded.
