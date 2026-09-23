import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Private operator entrance. Not linked from anywhere public and not indexed.
 * Only accounts registered as platform admins are let through to the console.
 */
export const Route = createFileRoute("/super-admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Operator sign in" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
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
      if (data) navigate({ to: "/platform" });
    });
  }, [loading, session, navigate]);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      const { data: isOperator } = await supabase.rpc("is_platform_admin");
      if (!isOperator) {
        await supabase.auth.signOut();
        throw new Error("This entrance is for platform operators only.");
      }
      navigate({ to: "/platform" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-ink px-5 text-deep-foreground">
      <div className="w-full max-w-sm">
        <span className="grid size-11 place-items-center rounded-xl bg-deep-foreground/10">
          <ShieldCheck className="size-5" />
        </span>
        <h1 className="mt-6 font-display text-2xl font-bold text-deep-foreground">Operator sign in</h1>
        <p className="mt-2 text-sm text-deep-foreground/60">
          Restricted entrance. Church accounts should use the normal sign-in page.
        </p>
        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="operator-email" className="text-deep-foreground/80">Email</Label>
            <Input
              id="operator-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="border-deep-foreground/20 bg-deep-foreground/5 text-deep-foreground"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="operator-password" className="text-deep-foreground/80">Password</Label>
            <Input
              id="operator-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="border-deep-foreground/20 bg-deep-foreground/5 text-deep-foreground"
            />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Checking…" : "Enter console"}
          </Button>
        </form>
      </div>
    </div>
  );
}
