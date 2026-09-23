import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/super-admin")({
  head: () => ({ meta: [
    { title: "Prime Haven operator sign in — Mene" },
    { name: "description", content: "Restricted Prime Haven operator access for Mene platform administration." },
    { property: "og:title", content: "Prime Haven operator sign in — Mene" },
    { property: "og:description", content: "Restricted Prime Haven operator access for Mene platform administration." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary" },
    { name: "robots", content: "noindex, nofollow" },
  ] }),
  component: SuperAdminSignIn,
});

function SuperAdminSignIn() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !session) return;
    supabase.rpc("is_platform_admin").then(({ data }) => {
      if (data === true) navigate({ to: "/platform" });
    });
  }, [loading, session, navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const { data, error: roleError } = await supabase.rpc("is_platform_admin");
      if (roleError || data !== true) {
        await supabase.auth.signOut();
        throw new Error("This entrance is restricted to Prime Haven operators.");
      }
      navigate({ to: "/platform" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-deep px-5 py-10 text-deep-foreground">
      <motion.section initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md rounded-lg border border-deep-foreground/15 bg-background p-7 text-foreground shadow-2xl">
        <div className="grid size-11 place-items-center rounded-lg bg-primary text-primary-foreground"><ShieldCheck className="size-5" /></div>
        <p className="mt-6 text-eyebrow">Restricted entrance</p>
        <h1 className="mt-2 font-display text-3xl font-bold">Prime Haven console</h1>
        <p className="mt-2 text-sm text-muted-foreground">Manage church accounts, packages, billing health, and reviews. Church member records are never available here.</p>
        <form onSubmit={submit} className="mt-7 space-y-4">
          <div className="space-y-2"><Label htmlFor="operator-email">Operator email</Label><Input id="operator-email" type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></div>
          <div className="space-y-2"><Label htmlFor="operator-password">Password</Label><Input id="operator-password" type="password" autoComplete="current-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></div>
          <Button type="submit" className="h-11 w-full" disabled={busy}>{busy ? "Checking access…" : "Sign in securely"}<ArrowRight /></Button>
        </form>
        <p className="mt-6 border-t pt-4 text-center text-xs text-muted-foreground">Church administrator? <Link to="/auth" className="font-semibold text-primary">Use church sign in</Link></p>
      </motion.section>
    </main>
  );
}