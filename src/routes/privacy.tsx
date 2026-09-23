import { createFileRoute, Link } from "@tanstack/react-router";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Mene" },
      {
        name: "description",
        content:
          "How Mene protects church and member information: per-church isolation, who can see what, and why the platform operator never sees member records.",
      },
      { property: "og:title", content: "Privacy Policy — Mene" },
      { property: "og:description", content: "Per-church isolation, role-based access and operator limits explained." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PrivacyPage,
});

const sections: Array<{ title: string; body: string[] }> = [
  {
    title: "1. Who holds your congregation's information",
    body: [
      "Each church is the owner of its own records. Prime Haven IT Solutions & Consultancy operates Mene on the church's behalf and processes those records only to provide the service.",
    ],
  },
  {
    title: "2. What Prime Haven can and cannot see",
    body: [
      "The platform operator's console shows registered church accounts only: church name, check-in address, package, account status, contact details for the account holder, aggregate counts and billing health.",
      "The operator never sees member names, phone numbers, email addresses, dates of birth, attendance records, member codes, messages sent by a church, or a church's internal activity log. These are technically out of reach of the operator console, not merely hidden from view.",
      "Only the church's own administrators — and staff or leaders the church permits — can see member records, and each of them sees only what their role allows. A leader, for example, sees the members who named them, not the whole congregation.",
    ],
  },
  {
    title: "3. What we collect",
    body: [
      "From church teams: name, email, phone, role and login credentials. From members at check-in: name, phone, optional email, date of birth, gender, marital status, location, occupation, educational level, who invited them, and their attendance.",
      "We also keep technical records needed to keep the service safe, such as the time of a check-in and a rate-limiting record of the device or network used.",
    ],
  },
  {
    title: "4. How information is protected",
    body: [
      "Every church's records are isolated at the database level, and every request is checked against the signed-in person's church and role — not just what appears on screen.",
      "Member codes are stored as one-way hashes, not as readable tokens. Public check-in, leader registration and reviews are rate limited per church and per device. All traffic is encrypted in transit.",
    ],
  },
  {
    title: "5. Who else is involved",
    body: [
      "We use a small number of service providers to run Mene: cloud hosting and database, payment processing for subscriptions, and — when your church enables them — email and text message delivery. They receive only what their task requires and may not use it for anything else.",
    ],
  },
  {
    title: "6. How long records are kept",
    body: [
      "Records are kept while your church's account is open. If an account closes, the records are retained for 90 days so the church can be restored or can export, then deleted or irreversibly anonymised.",
      "A church may delete or anonymise an individual member's record at any time.",
    ],
  },
  {
    title: "7. Members' choices",
    body: [
      "Members may ask their church to correct or remove their details, and may opt out of email or text messages. Churches must act on these requests, and Mene provides the controls to do so.",
      "Members who want to know how their information is used should contact their own church first; the church is the holder of the record.",
    ],
  },
  {
    title: "8. Contact",
    body: [
      "Questions about this policy can be sent to Prime Haven IT Solutions & Consultancy through the contact details on your church account.",
    ],
  },
];

function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border px-5 py-6">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <Link to="/" className="font-display text-lg font-bold">Mene</Link>
          <Link to="/terms" className="text-sm text-muted-foreground hover:text-foreground">Terms of Use</Link>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-5 py-16">
        <p className="text-eyebrow">Legal</p>
        <h1 className="mt-3 font-display text-4xl font-bold">Privacy Policy</h1>
        <p className="mt-4 text-muted-foreground">
          Your congregation's information belongs to your church. Here is exactly who can see what.
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
