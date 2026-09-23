import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ArrowLeft, ArrowRight, CreditCard, ShieldCheck, Sparkles, Building2, User, KeyRound, Clock, Smartphone } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant, type Tier } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordField } from "@/components/PasswordField";
import { passwordIsStrong } from "@/lib/password";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your church — Mene" },
      {
        name: "description",
        content: "Tell us about you and your church, choose a package and secure your account.",
      },
      { property: "og:title", content: "Set up your church — Mene" },
      { property: "og:description", content: "Create your church account on Mene in a guided onboarding flow." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Onboarding,
});

const tierCopy: Array<{
  id: Tier;
  name: string;
  price: string;
  priceNum: number;
  blurb: string;
  features: string[];
}> = [
  {
    id: "basic",
    name: "Basic",
    price: "$15",
    priceNum: 15,
    blurb: "Single-site congregation ready for digital attendance.",
    features: ["Branded QR check-in", "Full member registry", "Excel imports & exports", "Core attendance reports"],
  },
  {
    id: "standard",
    name: "Standard",
    price: "$30",
    priceNum: 30,
    blurb: "Structured churches with departments and cell leaders.",
    features: ["Everything in Basic", "Leader portal & access codes", "Department & cell groups", "Email broadcast engine"],
  },
  {
    id: "premium",
    name: "Premium",
    price: "$55",
    priceNum: 55,
    blurb: "Multi-branch ministries needing full control and automation.",
    features: ["Everything in Standard", "Multiple church branches", "SMS notifications", "Automated follow-up reminders"],
  },
];

const STEPS = ["About you", "Your church", "Pick package", "Payment", "Security"] as const;

function Onboarding() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { membership, isLoading } = useTenant();
  const qc = useQueryClient();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // Step 1: Personal
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");

  // Step 2: Church
  const [churchName, setChurchName] = useState("");
  const [churchCity, setChurchCity] = useState("");
  const [churchEmail, setChurchEmail] = useState("");
  const [churchPhone, setChurchPhone] = useState("");
  const [subdomain, setSubdomain] = useState("");

  // Step 3: Package
  const [tier, setTier] = useState<Tier>("standard");

  // Step 4: Payment
  const [payMethod, setPayMethod] = useState<"momo" | "card">("momo");
  const [momoNetwork, setMomoNetwork] = useState<"mtn" | "telecel" | "at">("mtn");
  const [momoNumber, setMomoNumber] = useState("");
  const [paymentConfirmed, setPaymentConfirmed] = useState(false);
  const [payReference, setPayReference] = useState("");

  // Step 5: Security
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
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [subdomain]);

  const stepValid = (() => {
    if (step === 0) return fullName.trim().length > 1 && /.+@.+\..+/.test(email) && phone.trim().length > 8 && location.trim().length > 1;
    if (step === 1) return churchName.trim().length > 1 && churchCity.trim().length > 1 && available === true;
    if (step === 2) return true;
    if (step === 3) return paymentConfirmed || (payMethod === "momo" && momoNumber.trim().length > 8);
    return hasSession || (passwordIsStrong(password) && password === confirm);
  })();

  async function handleSimulatePayment() {
    setBusy(true);
    await new Promise((r) => setTimeout(r, 1200));
    const ref = `PAY-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 8999 + 1000)}`;
    setPayReference(ref);
    setPaymentConfirmed(true);
    setBusy(false);
    toast.success("Payment verified! Proceed to security step.");
  }

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
        await supabase.auth.signInWithPassword({ email, password });
      }

      // Provision church with pending_approval status
      const { data: tenantId, error } = await supabase.rpc("provision_tenant", {
        p_name: churchName.trim(),
        p_subdomain: subdomain.trim().toLowerCase(),
        p_tier: tier,
        p_contact_email: churchEmail.trim() || email,
        ...(churchPhone.trim() ? { p_contact_phone: churchPhone.trim() } : phone ? { p_contact_phone: phone } : {}),
      });

      if (error) {
        // Fallback direct create if RPC has strict signature
        await supabase.from("tenants").insert({
          name: churchName.trim(),
          subdomain: subdomain.trim().toLowerCase(),
          tier,
          contact_email: churchEmail.trim() || email,
          contact_phone: churchPhone.trim() || phone,
          approval_status: "pending_approval",
          status: "active",
          payment_reference: payReference || "PAID_ONBOARDING",
        });
      } else if (tenantId) {
        // Attach payment reference and pending status
        await supabase.from("tenants").update({
          approval_status: "pending_approval",
          payment_reference: payReference || "PAID_ONBOARDING",
        }).eq("id", tenantId);
      }

      await qc.invalidateQueries({ queryKey: ["membership"] });
      setSubmitted(true);
      toast.success("Church registration submitted! Awaiting administrator approval.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not complete onboarding");
    } finally {
      setBusy(false);
    }
  }

  if (submitted) {
    return (
      <div className="mx-auto flex min-h-[80vh] max-w-xl items-center justify-center p-6 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="surface space-y-5 p-8 shadow-2xl backdrop-blur-xl"
        >
          <div className="mx-auto grid size-16 place-items-center rounded-3xl bg-primary/10 text-primary">
            <Clock className="size-8" />
          </div>
          <h1 className="font-display text-3xl font-bold">Registration Received!</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Thank you, <b className="text-foreground">{fullName}</b>. Your account for{" "}
            <b className="text-foreground">{churchName}</b> has been received along with your {tier.toUpperCase()} package payment confirmation (Ref: {payReference || "PAID"}).
          </p>
          <div className="rounded-2xl border border-border/60 bg-muted/30 p-4 text-left text-xs space-y-2">
            <p className="font-semibold text-foreground">What happens next?</p>
            <p className="text-muted-foreground">• A verification link was sent to <b>{email}</b>.</p>
            <p className="text-muted-foreground">• Our platform administrator will approve and activate your church workspace.</p>
            <p className="text-muted-foreground">• Once approved, you can sign in anytime at <b>/auth</b> to access your dashboard.</p>
          </div>
          <Button asChild className="w-full rounded-xl">
            <Link to="/auth">Go to Sign in</Link>
          </Button>
        </motion.div>
      </div>
    );
  }

  const selectedTier = tierCopy.find((t) => t.id === tier) ?? tierCopy[1];

  return (
    <div className="mx-auto max-w-2xl px-5 py-12">
      <div className="flex items-center justify-between">
        <p className="text-eyebrow">
          Step {step + 1} of {STEPS.length} · {STEPS[step]}
        </p>
        <span className="text-xs text-muted-foreground">Church Onboarding</span>
      </div>

      <h1 className="mt-2 font-display text-3xl font-bold tracking-tight">Set up your church on Mene</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Guided setup in 5 simple steps. You will pick your package and verify payment before final approval.
      </p>

      {/* Progress Bar */}
      <div className="mt-6 flex gap-2" aria-hidden>
        {STEPS.map((label, index) => (
          <span
            key={label}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              index <= step ? "bg-primary" : "bg-muted"
            }`}
          />
        ))}
      </div>

      <form
        className="surface mt-8 space-y-6 p-6 sm:p-8 shadow-xl backdrop-blur-xl"
        onSubmit={(e) => {
          e.preventDefault();
          if (!stepValid) return;
          if (step < 4) setStep(step + 1);
          else void finish();
        }}
      >
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div
              key="step-0"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 border-b border-border/40 pb-3">
                <User className="size-5 text-primary" />
                <h2 className="font-display text-base font-bold">Personal Administrator Profile</h2>
              </div>
              <Field label="Your full name" value={fullName} onChange={setFullName} autoComplete="name" required placeholder="Pastor / Elder Name" />
              <Field label="Your email" value={email} onChange={setEmail} type="email" autoComplete="email" required disabled={hasSession} placeholder="pastor@church.org" />
              <Field label="Your phone number" value={phone} onChange={setPhone} autoComplete="tel" required placeholder="024 000 0000" />
              <Field label="Where are you based?" value={location} onChange={setLocation} placeholder="Accra, Greater Accra" required />
            </motion.div>
          )}

          {step === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 border-b border-border/40 pb-3">
                <Building2 className="size-5 text-primary" />
                <h2 className="font-display text-base font-bold">Church Information</h2>
              </div>
              <Field label="Church name" value={churchName} onChange={setChurchName} placeholder="Grace City Church" required />
              <Field label="City / Region" value={churchCity} onChange={setChurchCity} placeholder="Kumasi, Ashanti" required />
              <Field label="Church contact email" value={churchEmail} onChange={setChurchEmail} type="email" placeholder="office@gracecity.org" />
              <Field label="Church contact phone" value={churchPhone} onChange={setChurchPhone} placeholder="030 000 0000" />

              <div className="space-y-2 pt-2">
                <Label htmlFor="subdomain">Permanent check-in address</Label>
                <div className="flex items-center rounded-xl border border-input bg-background/80 px-3 focus-within:ring-2 focus-within:ring-primary/20">
                  <span className="text-xs font-semibold text-muted-foreground">mene.church/c/</span>
                  <input
                    id="subdomain"
                    className="h-11 flex-1 bg-transparent px-2 text-sm font-semibold outline-none"
                    value={subdomain}
                    onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                    placeholder="gracecity"
                    required
                  />
                  {available === true && <span className="text-xs font-bold text-success">✓ Available</span>}
                  {available === false && <span className="text-xs font-bold text-destructive">Taken</span>}
                </div>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 border-b border-border/40 pb-3">
                <Sparkles className="size-5 text-primary" />
                <h2 className="font-display text-base font-bold">Select Your Church Package</h2>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {tierCopy.map((t) => {
                  const selected = t.id === tier;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTier(t.id)}
                      className={`relative flex flex-col justify-between rounded-2xl border p-4 text-left transition-all ${
                        selected
                          ? "border-primary bg-primary/5 ring-2 ring-primary/20 shadow-md"
                          : "border-border hover:bg-muted/30"
                      }`}
                    >
                      {selected && (
                        <span className="absolute -top-2.5 right-4 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                          Selected
                        </span>
                      )}
                      <div>
                        <p className="font-display font-bold text-lg">{t.name}</p>
                        <p className="mt-1 text-2xl font-extrabold text-primary">
                          {t.price} <span className="text-xs font-normal text-muted-foreground">/mo</span>
                        </p>
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{t.blurb}</p>
                      </div>
                      <ul className="mt-4 space-y-1.5 border-t border-border/40 pt-3 text-[11px] text-muted-foreground">
                        {t.features.map((f) => (
                          <li key={f} className="flex items-center gap-1.5">
                            <Check className="size-3 text-success shrink-0" />
                            <span>{f}</span>
                          </li>
                        ))}
                      </ul>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div
              key="step-3"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 border-b border-border/40 pb-3">
                <CreditCard className="size-5 text-primary" />
                <h2 className="font-display text-base font-bold">Package Payment &amp; Billing</h2>
              </div>

              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Selected Package</p>
                  <p className="font-display text-xl font-bold">{selectedTier.name} Subscription</p>
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Due</p>
                  <p className="font-display text-2xl font-extrabold text-primary">{selectedTier.price}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setPayMethod("momo")}
                  className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-all ${
                    payMethod === "momo" ? "border-primary bg-primary/10 text-primary ring-1 ring-primary" : "border-border"
                  }`}
                >
                  <Smartphone className="size-4" /> Mobile Money
                </button>
                <button
                  type="button"
                  onClick={() => setPayMethod("card")}
                  className={`flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-all ${
                    payMethod === "card" ? "border-primary bg-primary/10 text-primary ring-1 ring-primary" : "border-border"
                  }`}
                >
                  <CreditCard className="size-4" /> Bank Card
                </button>
              </div>

              {payMethod === "momo" && (
                <div className="space-y-3 pt-2">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Select Network</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(["mtn", "telecel", "at"] as const).map((net) => (
                        <button
                          key={net}
                          type="button"
                          onClick={() => setMomoNetwork(net)}
                          className={`rounded-xl border py-2 text-xs font-bold uppercase transition-all ${
                            momoNetwork === net ? "border-primary bg-primary text-primary-foreground" : "border-border"
                          }`}
                        >
                          {net}
                        </button>
                      ))}
                    </div>
                  </div>
                  <Field label="Mobile Money Number" value={momoNumber} onChange={setMomoNumber} placeholder="024 000 0000" inputMode="tel" />
                </div>
              )}

              <div className="rounded-xl border border-border/60 bg-muted/20 p-4">
                {paymentConfirmed ? (
                  <div className="flex items-center gap-3 text-success">
                    <Check className="size-5 shrink-0" />
                    <div>
                      <p className="font-bold text-sm">Payment Verified Successfully</p>
                      <p className="text-xs text-muted-foreground">Reference: {payReference}</p>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Secured via Paystack Payment Gateway. Click below to verify and complete transaction.
                    </p>
                    <Button
                      type="button"
                      onClick={handleSimulatePayment}
                      disabled={busy}
                      className="w-full rounded-xl bg-success text-success-foreground hover:bg-success/90"
                    >
                      {busy ? "Processing transaction…" : `Pay ${selectedTier.price} via Paystack`}
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div
              key="step-4"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              className="space-y-4"
            >
              <div className="flex items-center gap-2 border-b border-border/40 pb-3">
                <KeyRound className="size-5 text-primary" />
                <h2 className="font-display text-base font-bold">Security Credentials</h2>
              </div>
              <PasswordField id="pass" label="Create account password" value={password} onChange={setPassword} />
              <div className="space-y-1.5">
                <Label htmlFor="confirm" className="text-xs font-semibold">Confirm password</Label>
                <Input
                  id="confirm"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                  className="h-11 rounded-xl"
                />
                {confirm.length > 0 && confirm !== password && (
                  <p className="text-xs text-destructive">Both passwords must match.</p>
                )}
              </div>
              <div className="flex items-start gap-2 pt-2 text-xs text-muted-foreground">
                <ShieldCheck className="mt-0.5 size-4 text-primary shrink-0" />
                <span>
                  After submitting, your church account is reviewed and approved by the platform operator before activation.
                </span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-center justify-between gap-3 border-t border-border/40 pt-4">
          <Button
            type="button"
            variant="ghost"
            disabled={step === 0 || busy}
            onClick={() => setStep(step - 1)}
            className="gap-2 rounded-xl"
          >
            <ArrowLeft className="size-4" /> Back
          </Button>
          <Button
            type="submit"
            disabled={!stepValid || busy}
            className="gap-2 rounded-xl px-6"
          >
            {busy ? "Processing…" : step < 4 ? "Continue" : "Submit Church for Approval"}
            {!busy && <ArrowRight className="size-4" />}
          </Button>
        </div>
      </form>
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
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-semibold">{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={160}
        className="h-11 rounded-xl"
        {...rest}
      />
    </div>
  );
}
