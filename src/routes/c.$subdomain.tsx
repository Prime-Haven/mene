import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { CheckCircle2, Download, ShieldCheck, Share2, UserCog } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { getBrandAssetUrl, getChurchBranding, getPublicOpenServices, submitSelfCheckin } from "@/lib/checkin.functions";
import { getPublicLeaderTypes, getPublicLeaders, registerLeader } from "@/lib/leaders.functions";
import { passwordChecks, passwordIsStrong, PASSWORD_RULE_TEXT } from "@/lib/password";
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

const selectClass = "h-11 w-full rounded-md border border-input bg-background px-3 text-sm";

const educationLevels = [
  "No formal education",
  "Basic / JHS",
  "Secondary / SHS",
  "Technical / Vocational",
  "Diploma / HND",
  "Degree",
  "Masters",
  "Doctorate",
];

function CheckIn() {
  const { subdomain } = Route.useParams();
  const branding = useServerFn(getChurchBranding);
  const loadServices = useServerFn(getPublicOpenServices);
  const loadAsset = useServerFn(getBrandAssetUrl);
  const submit = useServerFn(submitSelfCheckin);
  const loadLeaders = useServerFn(getPublicLeaders);
  const reduceMotion = useReducedMotion();
  const [tab, setTab] = useState<"member" | "leader">("member");

  const { data: church } = useQuery({
    queryKey: ["branding", subdomain],
    queryFn: () => branding({ data: { subdomain } }),
  });
  const { data: services = [], isLoading: servicesLoading } = useQuery({
    queryKey: ["public-open-services", subdomain],
    queryFn: () => loadServices({ data: { subdomain } }),
  });
  const { data: leaders = [] } = useQuery({
    queryKey: ["public-leaders", subdomain],
    queryFn: () => loadLeaders({ data: { subdomain } }),
  });
  const { data: leaderTypes = [] } = useQuery({
    queryKey: ["public-leader-types", subdomain],
    queryFn: () => useServerFnOnce(subdomain),
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

  const leaderAreaOpen = leaderTypes.length > 0 || leaders.length > 0;

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    date_of_birth: "",
    gender: "",
    marital_status: "",
    residential_area: "",
    occupation: "",
    education_level: "",
    invited_by_leader_id: "",
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
      a.download = "my-mene-member-code.png";
      a.click();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [done, isiPhone]);

  async function saveQr() {
    if (!done) return;
    if (isiPhone && navigator.share) {
      try {
        const blob = await (await fetch(done.qr)).blob();
        const file = new File([blob], "my-mene-member-code.png", { type: "image/png" });
        await navigator.share({ title: "My church member code", files: [file] });
        return;
      } catch { /* Keep the direct-image fallback below. */ }
    }
    const a = document.createElement("a");
    a.href = done.qr;
    a.download = "my-mene-member-code.png";
    if (isiPhone) window.open(done.qr, "_blank");
    else a.click();
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
          gender: form.gender as "male" | "female",
          marital_status: form.marital_status as "single" | "married" | "divorced" | "widowed" | "separated" | "prefer_not_to_say",
          residential_area: form.residential_area,
          occupation: form.occupation,
          education_level: form.education_level,
          invited_by_leader_id: form.invited_by_leader_id,
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
        <p className="mt-3 text-xs text-muted-foreground">
          {isiPhone
            ? "Tap “Save to my device”, then choose Save Image. You can also press and hold the code and choose Save to Photos."
            : "Your code is downloading. If nothing happened, press “Save to my device”, or press and hold the code to save it."}
        </p>
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

      {leaderAreaOpen && (
        <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl border border-border bg-background/80 p-1">
          <button type="button" onClick={() => setTab("member")} className={`h-10 rounded-lg text-sm font-semibold transition-colors ${tab === "member" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            I'm a member
          </button>
          <button type="button" onClick={() => setTab("leader")} className={`h-10 rounded-lg text-sm font-semibold transition-colors ${tab === "leader" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            <UserCog className="mr-1 inline size-4" /> Leader area
          </button>
        </div>
      )}

      {tab === "leader" && leaderAreaOpen ? (
        <LeaderArea subdomain={subdomain} churchName={church?.name ?? "this church"} leaderTypes={leaderTypes} />
      ) : (
      <form onSubmit={onSubmit} className="surface mt-7 space-y-4 p-5">
        <div className="space-y-2">
          <Label htmlFor="service">Service</Label>
          <select id="service" required className={selectClass} value={form.service_id} onChange={(e) => setForm({ ...form, service_id: e.target.value })} disabled={services.length === 0}>
            <option value="">{servicesLoading ? "Loading services…" : services.length ? "Select a service" : "No open service available"}</option>
            {services.map((service) => <option key={service.id} value={service.id}>{service.name} — {service.service_date}</option>)}
          </select>
          {!servicesLoading && services.length === 0 && <p className="text-xs text-destructive">Please ask the church to open a service before checking in.</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="n">Full name</Label>
          <Input id="n" required minLength={2} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="p">Phone number</Label>
          <Input id="p" required inputMode="tel" placeholder="024 000 0000" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="email" type="email" inputMode="email" maxLength={160} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="d">Date of birth</Label>
            <Input id="d" type="date" required max={new Date().toISOString().slice(0, 10)} value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="g">Gender</Label>
            <select id="g" required className={selectClass} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })}>
              <option value="">Select gender</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="marital">Marital status</Label>
          <select id="marital" required className={selectClass} value={form.marital_status} onChange={(e) => setForm({ ...form, marital_status: e.target.value })}>
            <option value="">Select status</option><option value="single">Single</option><option value="married">Married</option><option value="divorced">Divorced</option><option value="widowed">Widowed</option><option value="separated">Separated</option><option value="prefer_not_to_say">Prefer not to say</option>
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="a">Where do you live?</Label>
          <Input id="a" required maxLength={120} value={form.residential_area} onChange={(e) => setForm({ ...form, residential_area: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="occupation">Occupation</Label>
          <Input id="occupation" required maxLength={120} value={form.occupation} onChange={(e) => setForm({ ...form, occupation: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="education">Educational level</Label>
          <select id="education" className={selectClass} value={form.education_level} onChange={(e) => setForm({ ...form, education_level: e.target.value })}>
            <option value="">Prefer not to say</option>
            {educationLevels.map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </div>
        {leaders.length > 0 && (
          <div className="space-y-2">
            <Label htmlFor="leader">Who invited you? <span className="font-normal text-muted-foreground">(your leader)</span></Label>
            <select id="leader" className={selectClass} value={form.invited_by_leader_id} onChange={(e) => setForm({ ...form, invited_by_leader_id: e.target.value })}>
              <option value="">No one / I came myself</option>
              {leaders.map((leader) => (
                <option key={leader.id} value={leader.id}>
                  {leader.full_name}{leader.leader_type ? ` — ${leader.leader_type}` : ""}
                </option>
              ))}
            </select>
          </div>
        )}

        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={consent} onChange={(e) => setConsent(e.target.checked)} required />
          <span className="text-muted-foreground">
            I agree to {church?.name ?? "this church"} keeping these details to record my attendance and contact me.
          </span>
        </label>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button type="submit" className="h-11 w-full" style={{ backgroundColor: church?.brand_primary }} disabled={busy || !consent || services.length === 0}>
          {busy ? "Checking you in…" : (church?.submit_button_text || "Check in")}
        </Button>
      </form>
      )}
      <p className="mt-5 text-center text-xs text-muted-foreground">Securely powered by Mene</p>
      </motion.div>
    </div>
  );
}

/** Placeholder kept out of the component body to satisfy the query factory below. */
async function useServerFnOnce(subdomain: string) {
  return getPublicLeaderTypes({ data: { subdomain } });
}

function LeaderArea({
  subdomain,
  churchName,
  leaderTypes,
}: {
  subdomain: string;
  churchName: string;
  leaderTypes: Array<{ id: string; name: string }>;
}) {
  const register = useServerFn(registerLeader);
  const [form, setForm] = useState({
    full_name: "",
    email: "",
    phone: "",
    date_of_birth: "",
    location: "",
    leader_type_id: "",
    access_code: "",
    password: "",
    confirm: "",
    photo: "",
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const checks = passwordChecks(form.password);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    if (file.size > 1_500_000) {
      setError("Please choose a photo smaller than 1.5 MB.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setForm((current) => ({ ...current, photo: String(reader.result ?? "") }));
    reader.readAsDataURL(file);
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (!passwordIsStrong(form.password)) {
      setError(PASSWORD_RULE_TEXT);
      return;
    }
    if (form.password !== form.confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      const result = await register({
        data: {
          subdomain,
          access_code: form.access_code,
          full_name: form.full_name,
          email: form.email,
          password: form.password,
          phone: form.phone,
          date_of_birth: form.date_of_birth,
          location: form.location,
          leader_type_id: form.leader_type_id,
          photo: form.photo,
        },
      });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSent(true);
    } catch {
      setError("Could not complete your registration. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="surface mt-7 space-y-3 p-6 text-center">
        <CheckCircle2 className="mx-auto size-9 text-success" />
        <h2 className="font-display text-xl font-bold">Check your email</h2>
        <p className="text-sm text-muted-foreground">
          We've sent a verification link to {form.email}. Confirm it, then sign in to see the members
          who chose you as their leader at {churchName}.
        </p>
        <Button asChild variant="outline"><Link to="/auth">Go to sign in</Link></Button>
      </div>
    );
  }

  return (
    <div className="mt-7 space-y-4">
      <div className="surface flex items-center justify-between gap-3 p-4">
        <div>
          <p className="font-semibold">Already a leader here?</p>
          <p className="text-xs text-muted-foreground">Sign in to see your members.</p>
        </div>
        <Button asChild variant="outline" size="sm"><Link to="/auth">Log in</Link></Button>
      </div>

      <form onSubmit={onSubmit} className="surface space-y-4 p-5">
        <div>
          <h2 className="font-display text-lg font-bold">Register as a leader</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            You need the leader access code from your church administrator.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="lname">Full name</Label>
          <Input id="lname" required minLength={2} maxLength={120} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lemail">Email</Label>
          <Input id="lemail" type="email" required maxLength={160} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lphone">Phone number</Label>
          <Input id="lphone" required inputMode="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lphoto">Profile photo <span className="font-normal text-muted-foreground">(optional)</span></Label>
          <Input id="lphoto" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => onPhoto(e.target.files?.[0])} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="ldob">Date of birth</Label>
            <Input id="ldob" type="date" max={new Date().toISOString().slice(0, 10)} value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lloc">Location</Label>
            <Input id="lloc" maxLength={120} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="ltype">Type of leader</Label>
          <select id="ltype" required className={selectClass} value={form.leader_type_id} onChange={(e) => setForm({ ...form, leader_type_id: e.target.value })}>
            <option value="">Select your role</option>
            {leaderTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select>
          {leaderTypes.length === 0 && <p className="text-xs text-muted-foreground">Your administrator has not added leader roles yet.</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="lcode">Leader access code</Label>
          <Input id="lcode" required minLength={4} maxLength={24} value={form.access_code} onChange={(e) => setForm({ ...form, access_code: e.target.value })} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lpass">Password</Label>
          <Input id="lpass" type="password" required autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <ul className="grid gap-1 text-xs text-muted-foreground">
            {checks.map((check) => (
              <li key={check.label} className={check.met ? "text-success" : undefined}>
                {check.met ? "✓" : "•"} {check.label}
              </li>
            ))}
          </ul>
        </div>
        <div className="space-y-2">
          <Label htmlFor="lconfirm">Confirm password</Label>
          <Input id="lconfirm" type="password" required autoComplete="new-password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="h-11 w-full" disabled={busy}>
          {busy ? "Creating your account…" : "Create leader account"}
        </Button>
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <ShieldCheck className="mt-0.5 size-3.5 shrink-0" />
          Leaders only ever see the members who chose them. Member contact details stay with your
          church administrators.
        </p>
      </form>
    </div>
  );
}
