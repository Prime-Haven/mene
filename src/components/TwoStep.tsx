import { useEffect, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const codeOk = (c: string) => /^\d{6}$/.test(c);

export function useMfaState() {
  return useQuery({
    queryKey: ["mfa-state"],
    queryFn: async () => {
      const [{ data: aal }, { data: factors }] = await Promise.all([
        supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
        supabase.auth.mfa.listFactors(),
      ]);
      const verified = (factors?.totp ?? []).filter((f) => f.status === "verified");
      return { current: aal?.currentLevel ?? "aal1", next: aal?.nextLevel ?? "aal1", factors: verified };
    },
    staleTime: 0,
  });
}

/** Asks for the 6-digit code from the authenticator app. */
export function MfaChallenge({ onDone }: { onDone: () => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!codeOk(code)) { toast.error("Enter the 6-digit code."); return; }
    setBusy(true);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      const factor = data?.totp.find((f) => f.status === "verified");
      if (!factor) throw new Error("No authenticator is set up.");
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
      if (error) throw new Error("That code didn't work. Try the latest one.");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not verify");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <Label htmlFor="mfa-code">6-digit code from your authenticator app</Label>
      <Input id="mfa-code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} autoFocus />
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Checking…" : "Verify"}</Button>
    </form>
  );
}

/** Enrolls a new authenticator: shows a QR code, then confirms with a code. */
export function MfaEnroll({ onDone }: { onDone: () => void }) {
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Clear any half-finished setup first.
      const { data: f } = await supabase.auth.mfa.listFactors();
      for (const u of f?.all ?? []) if (u.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: u.id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Mene:Log ${Date.now()}` });
      if (error || !data) { toast.error("Could not start setup."); return; }
      if (!cancelled) setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    })();
    return () => { cancelled = true; };
  }, []);
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    if (!enroll || !codeOk(code)) { toast.error("Enter the 6-digit code."); return; }
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code });
    setBusy(false);
    if (error) { toast.error("That code didn't work. Try the latest one."); return; }
    toast.success("Two-step sign-in is on");
    onDone();
  }
  if (!enroll) return <p className="text-sm text-muted-foreground">Preparing…</p>;
  return (
    <form onSubmit={verify} className="space-y-3">
      <p className="text-sm">Scan this with Google Authenticator, Microsoft Authenticator or similar.</p>
      <img src={enroll.qr} alt="Authenticator setup QR code" className="mx-auto size-44 rounded-md bg-white p-2" />
      <p className="break-all text-center text-xs text-muted-foreground">Or enter this key: <span className="font-mono">{enroll.secret}</span></p>
      <Input inputMode="numeric" autoComplete="one-time-code" aria-label="6-digit code" placeholder="6-digit code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} />
      <Button type="submit" className="w-full" disabled={busy}>{busy ? "Checking…" : "Turn on"}</Button>
    </form>
  );
}

/** Blocks the signed-in app until the second step is satisfied (or set up, when required). */
export function MfaGate({ required, children }: { required: boolean; children: ReactNode }) {
  const state = useMfaState();
  const qc = useQueryClient();
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["mfa-state"] });
    qc.invalidateQueries();
  };
  if (state.isLoading || !state.data) return <>{children}</>;
  const { current, next, factors } = state.data;
  const needsChallenge = next === "aal2" && current !== "aal2";
  const needsSetup = required && factors.length === 0;
  if (!needsChallenge && !needsSetup) return <>{children}</>;
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <div className="w-full max-w-sm rounded-lg border bg-card p-6 shadow-[var(--shadow-panel)]">
        <ShieldCheck className="size-6 text-primary" />
        <h1 className="mt-3 text-lg font-bold">{needsSetup ? "Set up two-step sign-in" : "Two-step sign-in"}</h1>
        <p className="mb-4 mt-1 text-sm text-muted-foreground">{needsSetup ? "Your church requires it for every staff account." : "Enter the code to continue."}</p>
        {needsSetup ? <MfaEnroll onDone={refresh} /> : <MfaChallenge onDone={refresh} />}
      </div>
    </div>
  );
}

/** Settings > Security panel. */
export function TwoStepSettings({ tenantId, isOwner, requireMfa }: { tenantId: string; isOwner: boolean; requireMfa: boolean }) {
  const state = useMfaState();
  const qc = useQueryClient();
  const [enrolling, setEnrolling] = useState(false);
  const on = (state.data?.factors.length ?? 0) > 0;
  async function turnOff() {
    if (requireMfa) { toast.error("Your church requires two-step sign-in."); return; }
    for (const f of state.data?.factors ?? []) {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
      if (error) { toast.error("Could not turn it off. Sign in again and retry."); return; }
    }
    await supabase.auth.refreshSession();
    toast.success("Two-step sign-in is off");
    qc.invalidateQueries({ queryKey: ["mfa-state"] });
  }
  async function setRequired(v: boolean) {
    const { error } = await supabase.rpc("set_require_mfa", { p_tenant: tenantId, p_required: v });
    if (error) { toast.error(error.message); return; }
    toast.success(v ? "All staff must now use two-step sign-in" : "Two-step sign-in is now optional");
    qc.invalidateQueries({ queryKey: ["membership"] });
  }
  return (
    <section className="rounded-lg border bg-card p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold"><ShieldCheck className="size-4 text-primary" /> Two-step sign-in</h2>
      <p className="mt-1 text-sm text-muted-foreground">Ask for a code from an authenticator app after your password.</p>
      {enrolling ? (
        <div className="mt-4 max-w-sm"><MfaEnroll onDone={() => { setEnrolling(false); qc.invalidateQueries({ queryKey: ["mfa-state"] }); }} /></div>
      ) : (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className={`rounded px-2 py-1 text-xs font-semibold ${on ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>{on ? "On" : "Off"}</span>
          {on ? <Button size="sm" variant="outline" onClick={turnOff}>Turn off</Button> : <Button size="sm" onClick={() => setEnrolling(true)}>Turn on</Button>}
        </div>
      )}
      {isOwner && (
        <label className="mt-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={requireMfa} onChange={(e) => setRequired(e.target.checked)} />
          Require two-step sign-in for all staff in this church
        </label>
      )}
    </section>
  );
}
