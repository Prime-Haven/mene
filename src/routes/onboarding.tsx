import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ArrowLeft, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant, type Tier } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/PasswordField";
import { passwordIsStrong } from "@/lib/password";

export const Route = createFileRoute("/onboarding")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set up your church — Mene" },
      {
        name: "description",
        content: "Tell us about you and your church, choose a package and secure your account.",
      },
      { property: "og:title", content: "Set up your church — Mene" },
      { property: "og:description", content: "Create your church account on Mene in four short steps." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Onboarding,
});

const tierCopy: Array<{ id: Tier; name: string; price: string; blurb: string }> = [
  { id: "basic", name: "Basic", price: "$15", blurb: "One account, a full member list, check-in and reports." },
  { id: "standard", name: "Standard", price: "$30", blurb: "Adds staff and leader logins, groups and email broadcasts." },
  { id: "premium", name: "Premium", price: "$55", blurb: "Adds branches, text messaging and automated follow-up." },
];

const STEPS = ["About you", "Your church", "Your plan", "Security"] as const;

function Onboarding() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { membership, isLoading } = useTenant();
  const qc = useQueryClient();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");

  const [churchName, setChurchName] = useState("");
  const [churchCity, setChurchCity] = useState("");
  const [churchEmail, setChurchEmail] = useState("");
  const [churchPhone, setChurchPhone] = useState("");
  const [subdomain, setSubdomain] = useState("");

  const [tier, setTier] = useState<Tier>("standard");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");

  const hasSession = !loading && !!session;

  useEffect(() => {
    if (session?.user.email) setEmail((value) => value || session.user.email!);
  }, [session]);

  useEffect(() => {
    if (!isLoading && membership) navigate({ to: "/dashboard" });
  }, [isLoading, membership, navigate]);

  useEffect(() => {
    const value = subdomain.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(value)) {
      setAvailable(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await supabase.rpc("subdomain_available", { p_subdomain: value });
      if (!cancelled) setAvailable(data === true);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [subdomain]);

  const stepValid = (() => {
    if (step === 0) return fullName.trim().length > 1 && /.+@.+\..+/.test(email) && phone.trim().length > 8 && location.trim().length > 1;
    if (step === 1) return churchName.trim().length > 1 && churchCity.trim().length > 1 && available === true;
    if (step === 2) return true;
    return hasSession || (passwordIsStrong(password) && password === confirm);
  })();

  async function finish() {
    setBusy(true);
    try {
      if (!hasSession) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/onboarding`,
            data: { full_name: fullName, phone, location, church_city: churchCity },
          },
        });
        if (signUpError) throw signUpError;
        const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
        if (signInError) {
          toast.success("Account created. Confirm your email, then sign in to finish setting up your church.");
          navigate({ to: "/auth", search: { mode: "signin" } });
          return;
        }
      }

      const { error } = await supabase.rpc("provision_tenant", {
        p_name: churchName.trim(),
        p_subdomain: subdomain.trim().toLowerCase(),
        p_tier: tier,
        p_contact_email: churchEmail.trim() || email,
        ...(churchPhone.trim() ? { p_contact_phone: churchPhone.trim() } : phone ? { p_contact_phone: phone } : {}),
      });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["membership"] });
      toast.success("Your church is ready.");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create the church");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-14">
      <p className="text-eyebrow">Step {step + 1} of 4 · {STEPS[step]}</p>
      <h1 className="mt-3 font-display text-3xl font-bold">Create your church on Mene</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        You can change the name, logo and package later. Your check-in address is permanent.
      </p>

      <div className="mt-6 flex gap-2" aria-hidden>
        {STEPS.map((label, index) => (
          <span
            key={label}
            className={`h-1.5 flex-1 rounded-full transition-colors ${index <= step ? "bg-primary" : "bg-muted"}`}
          />
        ))}
      </div>

      <form
        className="surface mt-8 space-y-6 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (!stepValid) return;
          if (step < 3) setStep(step + 1);
          else void finish();
        }}
      >
        {step === 0 && (
          <>
            <Field label="Your full name" value={fullName} onChange={setFullName} autoComplete="name" required />
            <Field label="Your email" value={email} onChange={setEmail} type="email" autoComplete="email" required disabled={hasSession} />
            <Field label="Your phone number" value={phone} onChange={setPhone} autoComplete="tel" required />
            <Field label="Where are you based?" value={location} onChange={setLocation} placeholder="Accra, Greater Accra" required />
          </>
        )}

        {step === 1 && (
          <>
            <Field label="Church name" value={churchName} onChange={setChurchName} placeholder="Grace Chapel" required />
            <Field label="Church location" value={churchCity} onChange={setChurchCity} placeholder="Kumasi, Ashanti" required />
            <Field label="Church contact email" value={churchEmail} onChange={setChurchEmail} type="email" />
            <Field label="Church contact phone" value={churchPhone} onChange={setChurchPhone} />
            <div className="space-y-2">
              <Label htmlFor="sub">Your check-in link name</Label>
              <div className="flex items-center gap-2">
                <span className="whitespace-nowrap text-sm text-muted-foreground">mene.app/c/</span>
                <Input
                  id="sub"
                  value={subdomain}
                  onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="gracechapel"
                  required
                  minLength={3}
                  maxLength={40}
                />
              </div>
              {available === true && (
                <p className="flex items-center gap-1 text-xs text-success"><Check className="size-3" /> Available</p>
              )}
              {available === false && <p className="text-xs text-destructive">Already taken</p>}
            </div>
          </>
        )}

        {step === 2 && (
          <fieldset className="space-y-3">
            <legend className="text-sm font-medium">Choose your package</legend>
            {tierCopy.map((t) => (
              <label
                key={t.id}
                className={`flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors ${
                  tier === t.id ? "border-primary bg-accent/50" : "border-border hover:bg-secondary"
                }`}
              >
                <input type="radio" name="tier" className="mt-1 accent-[var(--primary)]" checked={tier === t.id} onChange={() => setTier(t.id)} />
                <span>
                  <span className="block font-semibold">{t.name} · {t.price}/month</span>
                  <span className="block text-sm text-muted-foreground">{t.blurb}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}

        {step === 3 && (
          hasSession ? (
            <p className="text-sm text-muted-foreground">
              You are already signed in, so your existing password stays as it is. Create your church to finish.
            </p>
          ) : (
            <>
              <PasswordField id="password" label="Create a password" value={password} onChange={setPassword} />
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm password</Label>
                <Input id="confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
                {confirm.length > 0 && confirm !== password && (
                  <p className="text-xs text-destructive">Both passwords must match.</p>
                )}
              </div>
            </>
          )
        )}

        <div className="flex items-center justify-between gap-3 pt-2">
          <Button type="button" variant="ghost" disabled={step === 0 || busy} onClick={() => setStep(step - 1)}>
            <ArrowLeft /> Back
          </Button>
          <Button type="submit" disabled={!stepValid || busy}>
            {busy ? "Creating…" : step < 3 ? "Continue" : "Create church"}
            {!busy && <ArrowRight />}
          </Button>
        </div>
      </form>

      <p className="mt-4 text-xs text-muted-foreground">
        Your subscription starts on a 30-day cycle. Payment is collected from the Billing screen.
      </p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
} & Omit<React.ComponentProps<typeof Input>, "value" | "onChange">) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} maxLength={160} {...rest} />
    </div>
  );
}
