import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, Minus, QrCode, ShieldCheck, Users, BarChart3, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Patmos — Church attendance, digitised" },
      {
        name: "description",
        content:
          "QR check-in, digital membership records and structured reporting for churches in Ghana. Three tiers, your own branded subdomain, monthly subscription.",
      },
      { property: "og:title", content: "Patmos — Church attendance, digitised" },
      {
        property: "og:description",
        content:
          "QR check-in, digital membership records and structured reporting for churches in Ghana.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

const tiers = [
  {
    name: "Basic",
    who: "Single-site churches wanting digital records without hierarchy",
    structure: "A flat list of members",
    accounts: "One church account",
  },
  {
    name: "Standard",
    who: "Churches with ministry, unit or department leaders",
    structure: "One flat leader layer",
    accounts: "Church account + a login per leader",
    featured: true,
  },
  {
    name: "Premium",
    who: "Large, cell-structured and multi-branch ministries",
    structure: "Custom named levels, any depth",
    accounts: "Super-admin + branch admins + leaders",
  },
];

const matrix: Array<[string, boolean, boolean, boolean]> = [
  ["Branded subdomain & logo", true, true, true],
  ["QR check-in & scanning", true, true, true],
  ["Attendance tracking & export", true, true, true],
  ["Excel import of existing members", true, true, true],
  ["Birthday reminders", true, true, true],
  ["Demographic & attendance analytics", true, true, true],
  ["Church admin account", false, true, true],
  ["Leader accounts & leader-scoped reporting", false, true, true],
  ["Custom leadership structure builder", false, false, true],
  ["Multi-branch support & branch admins", false, false, true],
  ["Cross-branch head office dashboard", false, false, true],
];

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <div className="flex items-center gap-2">
            <span className="grid size-8 place-items-center rounded-md bg-primary text-primary-foreground">
              <QrCode className="size-4" />
            </span>
            <span className="text-base font-bold tracking-tight">Patmos</span>
          </div>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/auth" search={{ mode: "signup" }}>
                Start a church
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <section className="border-b border-border bg-ink text-primary-foreground">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <p className="text-eyebrow text-primary">Prime Haven IT Solutions & Consultancy</p>
          <h1 className="mt-5 max-w-3xl text-4xl font-extrabold leading-[0.98] sm:text-6xl">
            Put down the paper attendance sheet.
          </h1>
          <p className="mt-6 max-w-xl text-lg font-light text-primary-foreground/75">
            QR check-in, a proper membership registry and reports your pastor can read on Tuesday
            morning — on your own church subdomain, for a monthly subscription.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth" search={{ mode: "signup" }}>
                Create your church
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-primary-foreground/25 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              <a href="#tiers">Compare tiers</a>
            </Button>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-6xl gap-5 px-5 py-16 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { icon: QrCode, t: "Check in in seconds", d: "One tap to open the scanner. Under four seconds per person at the door." },
          { icon: Users, t: "A registry, not a cupboard", d: "Import the spreadsheet you already have. Every first-timer is kept and findable." },
          { icon: BarChart3, t: "Answers, not totals", d: "Trends, first-timers, absentees, demographics and group performance." },
          { icon: Building2, t: "Your structure, your words", d: "Cells, units, ministries or zones — named and shaped the way your church works." },
        ].map(({ icon: Icon, t, d }) => (
          <div key={t} className="surface p-5">
            <Icon className="size-5 text-primary" />
            <h3 className="mt-4 text-base font-semibold">{t}</h3>
            <p className="mt-2 text-sm text-muted-foreground">{d}</p>
          </div>
        ))}
      </section>

      <section id="tiers" className="border-y border-border bg-secondary/50">
        <div className="mx-auto max-w-6xl px-5 py-16">
          <p className="text-eyebrow">Tiers</p>
          <h2 className="mt-3 text-3xl font-bold">Priced by complexity, never by gating the basics</h2>
          <p className="mt-3 max-w-2xl text-muted-foreground">
            Every tier runs the same check-in, attendance and reporting engine. What changes is how
            much organisational structure the system models.
          </p>

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {tiers.map((tier) => (
              <div
                key={tier.name}
                className={`surface p-6 ${tier.featured ? "ring-2 ring-primary" : ""}`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-bold">{tier.name}</h3>
                  {tier.featured && (
                    <span className="rounded-full bg-accent px-2.5 py-1 text-xs font-semibold text-accent-foreground">
                      Most churches
                    </span>
                  )}
                </div>
                <p className="mt-3 text-sm text-muted-foreground">{tier.who}</p>
                <dl className="mt-5 space-y-3 text-sm">
                  <div>
                    <dt className="text-eyebrow">Structure</dt>
                    <dd className="mt-1">{tier.structure}</dd>
                  </div>
                  <div>
                    <dt className="text-eyebrow">Accounts</dt>
                    <dd className="mt-1">{tier.accounts}</dd>
                  </div>
                </dl>
                <Button asChild className="mt-6 w-full" variant={tier.featured ? "default" : "outline"}>
                  <Link to="/auth" search={{ mode: "signup" }}>
                    Choose {tier.name}
                  </Link>
                </Button>
              </div>
            ))}
          </div>

          <div className="surface mt-10 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-card">
                  <th className="px-5 py-3 text-left font-semibold">Capability</th>
                  <th className="px-3 py-3 font-semibold">Basic</th>
                  <th className="px-3 py-3 font-semibold">Standard</th>
                  <th className="px-3 py-3 font-semibold">Premium</th>
                </tr>
              </thead>
              <tbody>
                {matrix.map(([label, ...cols]) => (
                  <tr key={label} className="border-b border-border/60 last:border-0">
                    <td className="px-5 py-3">{label}</td>
                    {cols.map((on, i) => (
                      <td key={i} className="px-3 py-3 text-center">
                        {on ? (
                          <Check className="mx-auto size-4 text-success" />
                        ) : (
                          <Minus className="mx-auto size-4 text-muted-foreground/50" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="surface flex flex-col gap-6 p-7 sm:flex-row sm:items-center">
          <ShieldCheck className="size-10 shrink-0 text-deep" />
          <div>
            <h2 className="text-2xl font-bold">Every church's data is provably separate</h2>
            <p className="mt-2 text-muted-foreground">
              Isolation is enforced in the database itself, not in application code. QR codes are
              random values stored only as hashes, check-in is rate limited, and every sensitive
              action is written to an append-only audit log your church owner can read. Built to meet
              Ghana's Data Protection Act, 2012 (Act 843).
            </p>
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-10 text-center text-sm text-muted-foreground">
        Patmos — a product of Prime Haven IT Solutions & Consultancy
      </footer>
    </div>
  );
}
