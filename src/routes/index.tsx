import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BarChart3,
  Check,
  FileSpreadsheet,
  Gift,
  Lock,
  Network,
  QrCode,
  ShieldCheck,
  Smartphone,
  Users,
  X,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Patmos — church attendance and membership, digitised" },
      {
        name: "description",
        content:
          "Patmos gives your church QR check-in at the door, a real membership registry, leadership structure and reports your pastor can read on Tuesday morning.",
      },
      { property: "og:title", content: "Patmos — church attendance and membership, digitised" },
      {
        property: "og:description",
        content:
          "QR check-in, membership registry, leadership structure and attendance reporting for churches in Ghana.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: LandingPage,
});

const features = [
  {
    icon: QrCode,
    title: "Check in under four seconds",
    body: "One scan at the door. First-timers check themselves in from their own phone and walk away with a code.",
  },
  {
    icon: Users,
    title: "A registry, not a cupboard",
    body: "Every member, every first-timer, searchable in a second. Nothing is ever lost to a missing attendance book.",
  },
  {
    icon: BarChart3,
    title: "Answers, not totals",
    body: "Trends, absentees, first-timer follow-up, demographics and group performance — ready before Tuesday.",
  },
  {
    icon: Network,
    title: "Your structure, your words",
    body: "Cells, units, ministries, zones or branches — named and nested the way your church actually works.",
  },
  {
    icon: FileSpreadsheet,
    title: "Bring the spreadsheet you have",
    body: "Import your existing membership list from Excel. We match the columns for you and keep every record.",
  },
  {
    icon: Gift,
    title: "Never miss a birthday",
    body: "This month's birthdays on the dashboard, with minors' contact details protected automatically.",
  },
];

const tiers = [
  {
    name: "Basic",
    price: "150",
    blurb: "Single-site churches wanting proper digital records without hierarchy.",
    features: [
      "Branded check-in page",
      "QR check-in & scanning",
      "Full membership registry",
      "Excel import & CSV export",
      "Attendance reports",
    ],
    missing: ["Leader logins", "Leadership structure", "Multiple branches"],
    cta: "Start with Basic",
  },
  {
    name: "Standard",
    price: "350",
    featured: true,
    blurb: "Churches with ministry, unit or department leaders who need their own logins.",
    features: [
      "Everything in Basic",
      "One leader layer with logins",
      "Group attendance reporting",
      "Per-leader member visibility",
      "Staff accounts & roles",
    ],
    missing: ["Nested levels, any depth", "Multiple branches"],
    cta: "Choose Standard",
  },
  {
    name: "Premium",
    price: "750",
    blurb: "Large, cell-structured and multi-branch ministries.",
    features: [
      "Everything in Standard",
      "Custom named levels, any depth",
      "Multiple branches",
      "Branch admins & super-admin",
      "Full audit log",
    ],
    missing: [],
    cta: "Choose Premium",
  },
];

const faqs = [
  {
    q: "Do members need to download an app?",
    a: "No. Members never log in. They are scanned at the door, or they check themselves in from a browser on their own phone using your church's check-in link.",
  },
  {
    q: "How do we pay?",
    a: "By card or mobile money through Paystack, in Ghana cedis. Subscriptions are yearly and we invoice you before renewal — we never silently debit your wallet.",
  },
  {
    q: "What happens if we stop paying?",
    a: "Your records are never deleted. Check-in and edits pause, and you keep read access and exports until you renew.",
  },
  {
    q: "Will it work on our phones?",
    a: "Yes. Patmos is built for entry-level Android phones on a 3G connection, which is what your ushers are actually holding at the door.",
  },
];

function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link to="/" className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[var(--shadow-accent)]">
              <QrCode className="size-4.5" />
            </span>
            <span className="font-display text-lg font-bold tracking-tight">Patmos</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-muted-foreground md:flex">
            <a href="#features" className="transition-colors hover:text-foreground">
              Features
            </a>
            <a href="#pricing" className="transition-colors hover:text-foreground">
              Pricing
            </a>
            <a href="#security" className="transition-colors hover:text-foreground">
              Security
            </a>
            <a href="#faq" className="transition-colors hover:text-foreground">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              to="/auth"
              search={{ mode: "signin" }}
              className="rounded-xl px-3.5 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-secondary"
            >
              Sign in
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-accent)] transition-all hover:-translate-y-0.5"
            >
              Start free
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-5 pt-20 pb-16 sm:pt-28">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[-18rem] size-[46rem] -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative mx-auto max-w-4xl text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-bold tracking-wide text-primary">
            NEW
            <span className="size-1 rounded-full bg-primary" />
            BUILT FOR CHURCHES IN GHANA
          </span>

          <h1 className="mt-7 font-display text-4xl font-extrabold leading-[1.08] sm:text-5xl md:text-6xl">
            Patmos.
            <br />
            <span className="text-primary">Digital stewardship</span> for the modern church.
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            QR attendance at the door, a membership registry that never loses a name, leadership
            structure in your own words, and reports your pastor can read on Tuesday morning.
          </p>

          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/auth"
              search={{ mode: "signup" }}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 font-semibold text-primary-foreground shadow-[var(--shadow-accent)] transition-all hover:-translate-y-0.5 sm:w-auto"
            >
              Create your church <ArrowRight className="size-4" />
            </Link>
            <a
              href="#pricing"
              className="inline-flex w-full items-center justify-center rounded-xl border border-border bg-card px-8 py-4 font-semibold text-primary transition-colors hover:bg-secondary sm:w-auto"
            >
              Compare plans
            </a>
          </div>

          <div className="stat-grid mx-auto mt-16 max-w-3xl text-left">
            {[
              { value: "< 4s", label: "per person at the door" },
              { value: "3", label: "plans, no feature hostage-taking" },
              { value: "100%", label: "records kept, even when paused" },
            ].map((s) => (
              <div key={s.label} className="surface p-5">
                <p className="font-display text-3xl font-bold text-primary">{s.value}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t border-border bg-card/40 px-5 py-20">
        <div className="mx-auto max-w-6xl">
          <p className="text-eyebrow">What you get</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold sm:text-4xl">
            Everything the church office keeps asking for
          </h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map(({ icon: Icon, title, body }) => (
              <div key={title} className="surface p-6 transition-shadow hover:shadow-lg">
                <span className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </span>
                <h3 className="mt-4 font-display text-base font-bold">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="px-5 py-20">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <p className="text-eyebrow">Pricing</p>
            <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">
              Priced by complexity, never by gating the basics
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-muted-foreground">
              Every plan runs the same check-in, attendance and reporting engine. What changes is how
              much organisational structure Patmos models for you. Prices in Ghana cedis, per year.
            </p>
          </div>

          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`relative flex flex-col gap-6 rounded-3xl p-8 ${
                  tier.featured
                    ? "border-2 border-primary bg-card shadow-2xl shadow-primary/10 md:scale-105"
                    : "border border-border bg-card"
                }`}
              >
                {tier.featured && (
                  <span className="absolute -top-3.5 left-1/2 -translate-x-1/2 rounded-full bg-primary px-4 py-1 text-[10px] font-bold uppercase tracking-wide text-primary-foreground">
                    Most churches
                  </span>
                )}
                <div className="space-y-2">
                  <h3
                    className={`text-xs font-bold uppercase tracking-[0.16em] ${
                      tier.featured ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    {tier.name}
                  </h3>
                  <div className="flex items-baseline">
                    <span className="mr-1 text-sm font-semibold">GH₵</span>
                    <span className="font-display text-4xl font-bold">{tier.price}</span>
                    <span className="ml-1 text-sm text-muted-foreground">/year</span>
                  </div>
                  <p className="text-sm text-muted-foreground">{tier.blurb}</p>
                </div>

                <ul className="flex-1 space-y-3.5">
                  {tier.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm">
                      <Check className="mt-0.5 size-4.5 shrink-0 text-primary" strokeWidth={2.5} />
                      {f}
                    </li>
                  ))}
                  {tier.missing.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <X className="mt-0.5 size-4.5 shrink-0 text-border" strokeWidth={2.5} />
                      {f}
                    </li>
                  ))}
                </ul>

                <Link
                  to="/auth"
                  search={{ mode: "signup" }}
                  className={`rounded-xl py-3 text-center font-semibold transition-colors ${
                    tier.featured
                      ? "bg-primary text-primary-foreground shadow-[var(--shadow-accent)] hover:opacity-90"
                      : "border border-border hover:bg-secondary"
                  }`}
                >
                  {tier.cta}
                </Link>
              </div>
            ))}
          </div>

          <p className="mt-12 text-center text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Secured by Paystack · Card & mobile money · Invoiced before renewal
          </p>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="border-t border-border bg-card/40 px-5 py-20">
        <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <p className="text-eyebrow">Security</p>
            <h2 className="mt-3 font-display text-3xl font-bold sm:text-4xl">
              Your congregation's data is not the product
            </h2>
            <p className="mt-4 text-muted-foreground">
              Every church is isolated at the database level, not just in the interface. One church
              can never read another church's records, and neither can a leader who was not given
              that group.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { icon: Lock, t: "Isolated per church", b: "Row-level rules enforced by the database on every single read." },
              { icon: ShieldCheck, t: "Rate limited", b: "Public check-in and sign-up are throttled to stop abuse and scraping." },
              { icon: Users, t: "Least privilege", b: "Ushers, leaders, admins and owners each see only what they need." },
              { icon: Smartphone, t: "Minors protected", b: "Children's contact details are hidden from non-admin accounts." },
            ].map(({ icon: Icon, t, b }) => (
              <div key={t} className="surface p-5">
                <Icon className="size-5 text-primary" />
                <h3 className="mt-3 font-display text-sm font-bold">{t}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="px-5 py-20">
        <div className="mx-auto max-w-3xl">
          <p className="text-eyebrow text-center">Questions</p>
          <h2 className="mt-3 text-center font-display text-3xl font-bold sm:text-4xl">
            Before you commit
          </h2>
          <div className="mt-10 space-y-4">
            {faqs.map(({ q, a }) => (
              <details key={q} className="group panel p-5 open:shadow-[var(--shadow-panel)]">
                <summary className="cursor-pointer list-none font-display text-base font-bold marker:hidden">
                  {q}
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="px-5 pb-24">
        <div className="mx-auto max-w-5xl rounded-3xl bg-ink px-8 py-14 text-center text-deep-foreground">
          <h2 className="font-display text-3xl font-extrabold text-deep-foreground sm:text-4xl">
            Sunday is coming.
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-deep-foreground/70">
            Set up your church in under two minutes and scan your first member this weekend.
          </p>
          <Link
            to="/auth"
            search={{ mode: "signup" }}
            className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-8 py-4 font-semibold text-primary-foreground transition-all hover:-translate-y-0.5"
          >
            Create your church <ArrowRight className="size-4" />
          </Link>
        </div>
      </section>

      <footer className="border-t border-border px-5 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-muted-foreground sm:flex-row">
          <span className="font-display font-bold text-foreground">Patmos</span>
          <span>A product of Prime Haven IT Solutions &amp; Consultancy</span>
        </div>
      </footer>
    </div>
  );
}
