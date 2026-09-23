import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Use — Mene" },
      {
        name: "description",
        content:
          "The terms that govern how churches use Mene: accounts, subscriptions, acceptable use, check-in records and cancellation.",
      },
      { property: "og:title", content: "Terms of Use — Mene" },
      { property: "og:description", content: "Accounts, subscriptions, acceptable use and cancellation terms for Mene." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: TermsPage,
});

const sections: Array<{ title: string; body: string[] }> = [
  {
    title: "1. Who these terms are between",
    body: [
      "Mene is operated by Prime Haven IT Solutions & Consultancy. These terms apply to the church that holds the account, to every administrator, staff member and leader the church invites, and to anyone who checks in through the church's own check-in link.",
      "By creating a church account you confirm you are authorised to accept these terms on behalf of that church.",
    ],
  },
  {
    title: "2. Your account",
    body: [
      "The person who creates the church account becomes its owner and is responsible for who else is given access. Passwords must not be shared, and each administrator, staff member or leader should have their own login.",
      "Your church's check-in address is permanent once claimed, so choose it carefully. You may change your church name, logo and package at any time.",
    ],
  },
  {
    title: "3. Subscriptions and payment",
    body: [
      "Packages are billed monthly in US dollars: Basic $15, Standard $30 and Premium $55 per month. A subscription runs on a 30-day cycle from the day payment clears.",
      "Mobile money cannot be debited automatically, so you confirm each renewal yourself. If a renewal is not completed, check-in and editing pause while your church keeps read and export access to everything already recorded.",
      "Additional member space can be purchased by Standard and Premium churches. Extra space is added to your package limit and remains while your subscription is active.",
    ],
  },
  {
    title: "4. Your church's records",
    body: [
      "The records your church enters belong to your church. We store and process them so the service can work, and we do not sell them or use them to advertise to your members.",
      "You are responsible for collecting member information lawfully and for telling members how their details will be used. You must not upload information you have no right to hold.",
    ],
  },
  {
    title: "5. Acceptable use",
    body: [
      "Do not attempt to reach another church's records, probe or overload the service, upload harmful files, or use Mene to send unsolicited, deceptive or abusive messages.",
      "Member codes and check-in links are issued for your congregation's use. Publishing them for automated or fraudulent check-ins is a breach of these terms.",
      "We may suspend an account that puts other churches, the service or people's data at risk, and we will tell you why.",
    ],
  },
  {
    title: "6. Availability and support",
    body: [
      "We work to keep Mene available, especially around service times, but we cannot promise uninterrupted access. Planned maintenance is scheduled outside typical Sunday hours wherever possible.",
      "Support is provided by Prime Haven through the contact details on your account.",
    ],
  },
  {
    title: "7. Ending your subscription",
    body: [
      "You may cancel at any time from your Billing screen. Cancellation takes effect at the end of the paid period, and you can export your records before it closes.",
      "After closure we retain your church's records for 90 days so the account can be restored, then delete or irreversibly anonymise them.",
    ],
  },
  {
    title: "8. Changes to these terms",
    body: [
      "If these terms change we will tell the account owner by email before the change takes effect. Continuing to use Mene after that date means you accept the updated terms.",
    ],
  },
];

function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-5 py-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link to="/" className="font-display text-lg font-bold">Mene</Link>
          <Link to="/privacy" className="text-sm text-muted-foreground hover:text-foreground">Privacy Policy</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-16">
        <p className="text-eyebrow">Legal</p>
        <h1 className="mt-3 font-display text-4xl font-bold">Terms of Use</h1>
        <p className="mt-4 text-muted-foreground">
          How churches and their teams may use Mene. Written in plain language on purpose.
        </p>
        <div className="mt-12 space-y-10">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="font-display text-xl font-bold">{section.title}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph} className="mt-3 leading-relaxed text-muted-foreground">{paragraph}</p>
              ))}
            </section>
          ))}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
