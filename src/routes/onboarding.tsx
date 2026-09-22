import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant, type Tier } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/onboarding")({
  head: () => ({
    meta: [
      { title: "Set up your church — Mene" },
      {
        name: "description",
        content: "Name your church, claim your subdomain and choose a subscription tier.",
      },
      { property: "og:title", content: "Set up your church — Mene" },
      { property: "og:description", content: "Claim your subdomain and choose a tier." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Onboarding,
});

const tierCopy: Array<{ id: Tier; name: string; blurb: string }> = [
  { id: "basic", name: "Basic", blurb: "One account, a flat member list, full check-in and reports." },
  { id: "standard", name: "Standard", blurb: "Adds admin and leader logins with group-scoped reporting." },
  { id: "premium", name: "Premium", blurb: "Custom leadership levels, branches and a head-office dashboard." },
];

function Onboarding() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const { membership, isLoading } = useTenant();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [subdomain, setSubdomain] = useState("");
  const [phone, setPhone] = useState("");
  const [tier, setTier] = useState<Tier>("standard");
  const [busy, setBusy] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.rpc("provision_tenant", {
        p_name: name,
        p_subdomain: subdomain.trim().toLowerCase(),
        p_tier: tier,
        ...(session?.user.email ? { p_contact_email: session.user.email } : {}),
        ...(phone ? { p_contact_phone: phone } : {}),
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
    <div className="mx-auto max-w-2xl px-5 py-16">
      <p className="text-eyebrow">Step 1 of 1</p>
      <h1 className="mt-3 text-3xl font-bold">Set up your church</h1>
      <p className="mt-2 text-muted-foreground">
        You can change the name, logo and tier later. The subdomain is permanent.
      </p>

      <form onSubmit={onSubmit} className="surface mt-8 space-y-6 p-6">
        <div className="space-y-2">
          <Label htmlFor="church">Church name</Label>
          <Input
            id="church"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Grace Chapel"
            required
            minLength={2}
            maxLength={120}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="sub">Your check-in address</Label>
          <div className="flex items-center gap-2">
            <Input
              id="sub"
              value={subdomain}
              onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
              placeholder="patmos"
              required
              minLength={3}
              maxLength={40}
            />
            <span className="whitespace-nowrap text-sm text-muted-foreground">.patmos.app</span>
          </div>
          {available === true && (
            <p className="flex items-center gap-1 text-xs text-success">
              <Check className="size-3" /> Available
            </p>
          )}
          {available === false && <p className="text-xs text-destructive">Already taken</p>}
        </div>

        <div className="space-y-2">
          <Label htmlFor="phone">Contact phone</Label>
          <Input
            id="phone"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="024 000 0000"
            maxLength={20}
          />
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Subscription tier</legend>
          {tierCopy.map((t) => (
            <label
              key={t.id}
              className={`flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors ${
                tier === t.id ? "border-primary bg-accent/50" : "border-border hover:bg-secondary"
              }`}
            >
              <input
                type="radio"
                name="tier"
                className="mt-1 accent-[var(--primary)]"
                checked={tier === t.id}
                onChange={() => setTier(t.id)}
              />
              <span>
                <span className="block font-semibold">{t.name}</span>
                <span className="block text-sm text-muted-foreground">{t.blurb}</span>
              </span>
            </label>
          ))}
        </fieldset>

        <Button type="submit" className="w-full" disabled={busy || available === false}>
          {busy ? "Creating…" : "Create church"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Your subscription starts on a 30-day cycle. Payment is collected from the Billing screen.
        </p>
      </form>
    </div>
  );
}
