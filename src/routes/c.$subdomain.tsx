import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { CheckCircle2, Download, Share2 } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { getBrandAssetUrl, getChurchBranding, getPublicOpenServices, submitSelfCheckin } from "@/lib/checkin.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/c/$subdomain")({
  head: () => ({
    meta: [
      { title: "Check in — Mene" },
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
  const loadServices = useServerFn(getPublicOpenServices);
  const loadAsset = useServerFn(getBrandAssetUrl);
  const submit = useServerFn(submitSelfCheckin);
  const reduceMotion = useReducedMotion();

  const { data: church } = useQuery({
    queryKey: ["branding", subdomain],
    queryFn: () => branding({ data: { subdomain } }),
  });
  const { data: services = [], isLoading: servicesLoading } = useQuery({
    queryKey: ["public-open-services", subdomain],
    queryFn: () => loadServices({ data: { subdomain } }),
  });
  const { data: logoUrl } = useQuery({
    queryKey: ["brand-asset", church?.logo_path],
    enabled: !!church?.logo_path,
    queryFn: () => loadAsset({ data: { path: church!.logo_path! } }),
  });
  const { data: backgroundUrl } = useQuery({
    queryKey: ["brand-asset", church?.background_path],
    enabled: !!church?.background_path,
    queryFn: () => loadAsset({ data: { path: church!.background_path! } }),
  });

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    date_of_birth: "",
    gender: "",
    marital_status: "",
    residential_area: "",
    occupation: "",
    service_id: "",
  });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ qr: string; returning: boolean; service: string } | null>(null);
  const isiPhone = typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);

  useEffect(() => {
    if (services.length === 1) setForm((current) => ({ ...current, service_id: services[0]!.id }));
  }, [services]);

  useEffect(() => {
    if (!done || isiPhone) return;
    const timer = window.setTimeout(() => {
      const a = document.createElement("a");
      a.href = done.qr;
      a.download = "my-patmos-member-code.png";
      a.click();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [done, isiPhone]);

  async function saveQr() {
    if (!done) return;
    if (isiPhone && navigator.share) {
      try {
        const blob = await (await fetch(done.qr)).blob();
        const file = new File([blob], "my-patmos-member-code.png", { type: "image/png" });
        await navigator.share({ title: "My church member code", files: [file] });
        return;
      } catch { /* Keep the direct-image fallback below. */ }
    }
    const a = document.createElement("a");
    a.href = done.qr;
    a.download = "my-patmos-member-code.png";
    isiPhone ? window.open(done.qr, "_blank") : a.click();
  }

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
          marital_status: form.marital_status as "single" | "married" | "divorced" | "widowed" | "separated" | "prefer_not_to_say",
          residential_area: form.residential_area,
          occupation: form.occupation,
          service_id: form.service_id,
          consent: true as const,
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const qr = await QRCode.toDataURL(result.token, { width: 420, margin: 1 });
      setDone({ qr, returning: result.returning, service: result.service });
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
      <motion.div initial={reduceMotion ? false : { opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-md px-5 py-16 text-center">
        <CheckCircle2 className="mx-auto size-10 text-success" />
        <h1 className="mt-4 text-2xl font-bold">
          {done.returning ? "Welcome back!" : "You're checked in"}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Attendance recorded for {done.service}. Save this code and show it at the door next time.
        </p>
        <img src={done.qr} alt="Your QR code" className="mx-auto mt-6 rounded-lg border border-border" />
        <Button className="mt-6" onClick={saveQr}>
          {isiPhone ? <Share2 className="size-4" /> : <Download className="size-4" />}
          Save to my device
        </Button>
        {isiPhone && <p className="mt-3 text-xs text-muted-foreground">Choose “Save Image” in the share sheet. If it opens separately, press and hold the code.</p>}
      </motion.div>
    );
  }

  return (
    <div className="min-h-svh bg-cover bg-center px-4 py-8 sm:py-12" style={{ backgroundImage: backgroundUrl ? `linear-gradient(rgb(255 255 255 / .9), rgb(255 255 255 / .96)), url(${backgroundUrl})` : undefined, "--church-primary": church?.brand_primary ?? "#3b82f6", "--church-accent": church?.brand_accent ?? "#0f172a" } as React.CSSProperties}>
      <motion.div initial={reduceMotion ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mx-auto max-w-md">
      {logoUrl && <img src={logoUrl} alt={`${church?.name} logo`} className="mb-5 h-16 max-w-48 object-contain" />}
      <p className="text-eyebrow">{church?.name ?? "Check in"}</p>
      <h1 className="mt-3 text-3xl font-bold" style={{ color: church?.brand_accent }}>Welcome — let's check you in</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {church?.welcome_message || `${church?.name ?? "This church"} is collecting your name and contact details to record your
        attendance and follow up with you pastorally. Only the church's admins and your group leader
        will see them.`}
      </p>

      <form onSubmit={onSubmit} className="surface mt-7 space-y-4 p-5">
        <div className="space-y-2">
          <Label htmlFor="service">Service</Label>
          <select id="service" required className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.service_id} onChange={(e) => setForm({ ...form, service_id: e.target.value })} disabled={services.length === 0}>
            <option value="">{servicesLoading ? "Loading services…" : services.length ? "Select a service" : "No open service available"}</option>
            {services.map((service) => <option key={service.id} value={service.id}>{service.name} — {service.service_date}</option>)}
          </select>
          {!servicesLoading && services.length === 0 && <p className="text-xs text-destructive">Please ask the church to open a service before checking in.</p>}
        </div>
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
          <Label htmlFor="email">Email <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="email" type="email" inputMode="email" maxLength={160} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
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
                required
                max={new Date().toISOString().slice(0, 10)}
              value={form.date_of_birth}
              onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="g">Gender</Label>
            <select
              id="g"
              required
              className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={form.gender}
              onChange={(e) => setForm({ ...form, gender: e.target.value })}
            >
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="marital">Marital status</Label>
          <select id="marital" required className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.marital_status} onChange={(e) => setForm({ ...form, marital_status: e.target.value })}>
            <option value="">Select status</option><option value="single">Single</option><option value="married">Married</option><option value="divorced">Divorced</option><option value="widowed">Widowed</option><option value="separated">Separated</option><option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="a">Where do you live?</Label>
          <Input
            id="a"
            required
            maxLength={120}
            value={form.residential_area}
            onChange={(e) => setForm({ ...form, residential_area: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="occupation">Occupation</Label>
          <Input id="occupation" required maxLength={120} value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} />
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

        <Button type="submit" className="h-11 w-full" style={{ backgroundColor: church?.brand_primary }} disabled={busy || !consent || services.length === 0}>
          {busy ? "Checking you in…" : (church?.submit_button_text || "Check in")}
        </Button>
      </form>
      <p className="mt-5 text-center text-xs text-muted-foreground">Securely powered by Mene</p>
      </motion.div>
    </div>
  );
}
