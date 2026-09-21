import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { CheckCircle2 } from "lucide-react";
import { getChurchBranding, submitSelfCheckin } from "@/lib/checkin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/c/$subdomain")({
  head: () => ({
    meta: [
      { title: "Check in — Grace City Hub" },
      { name: "description", content: "Check in to today's service and get your personal QR code." },
      { property: "og:title", content: "Check in" },
      { property: "og:description", content: "Check in to today's service and get your QR code." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CheckIn,
  errorComponent: () => (
    <p className="p-10 text-center text-sm text-muted-foreground">
      This check-in page could not be loaded.
    </p>
  ),
});

function CheckIn() {
  const { subdomain } = Route.useParams();
  const branding = useServerFn(getChurchBranding);
  const submit = useServerFn(submitSelfCheckin);

  const { data: church } = useQuery({
    queryKey: ["branding", subdomain],
    queryFn: () => branding({ data: { subdomain } }),
  });

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    date_of_birth: "",
    gender: "",
    residential_area: "",
  });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ qr: string; returning: boolean } | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await submit({
        data: {
          subdomain,
          full_name: form.full_name,
          phone: form.phone,
          email: form.email,
          date_of_birth: form.date_of_birth,
          gender: form.gender as "male" | "female" | "other" | "",
          residential_area: form.residential_area,
          consent: true as const,
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const qr = await QRCode.toDataURL(result.token, { width: 420, margin: 1 });
      setDone({ qr, returning: result.returning });
    } catch {
      setError("Something went wrong. Please ask an usher for help.");
    } finally {
      setBusy(false);
    }
  }

  if (church === null) {
    return (
      <div className="grid min-h-screen place-items-center px-5 text-center">
        <p className="text-sm text-muted-foreground">This church check-in page does not exist.</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-md px-5 py-16 text-center">
        <CheckCircle2 className="mx-auto size-10 text-success" />
        <h1 className="mt-4 text-2xl font-bold">
          {done.returning ? "Welcome back!" : "You're checked in"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Save this code. Show it at the door next time and you'll be checked in instantly.
        </p>
        <img src={done.qr} alt="Your QR code" className="mx-auto mt-6 rounded-lg border border-border" />
        <Button asChild className="mt-6">
          <a href={done.qr} download="my-checkin-code.png">
            Save my code
          </a>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-5 py-12">
      <p className="text-eyebrow">{church?.name ?? "Check in"}</p>
      <h1 className="mt-3 text-3xl font-bold">Welcome — let's check you in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {church?.name ?? "This church"} is collecting your name and contact details to record your
        attendance and follow up with you pastorally. Only the church's admins and your group leader
        will see them.
      </p>

      <form onSubmit={onSubmit} className="surface mt-7 space-y-4 p-5">
        <div className="space-y-2">
          <Label htmlFor="n">Full name</Label>
          <Input
            id="n"
            required
            minLength={2}
            value={form.full_name}
            onChange={(e) => setForm({ ...form, full_name: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p">Phone number</Label>
          <Input
            id="p"
            required
            inputMode="tel"
            placeholder="024 000 0000"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="d">Date of birth</Label>
            <Input
              id="d"
              type="date"
              value={form.date_of_birth}
              onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="g">Gender</Label>
            <select
              id="g"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
            >
              <option value="">Prefer not to say</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="a">Where do you live?</Label>
          <Input
            id="a"
            value={form.residential_area}
            onChange={(e) => setForm({ ...form, residential_area: e.target.value })}
          />
        </div>

        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            required
          />
          <span className="text-muted-foreground">
            I agree to {church?.name ?? "this church"} keeping these details to record my attendance
            and contact me.
          </span>
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="w-full" disabled={busy || !consent}>
          {busy ? "Checking you in…" : "Check in"}
        </Button>
      </form>
    </div>
  );
}
