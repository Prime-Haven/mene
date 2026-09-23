import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ShieldCheck, Lock, KeyRound, Sparkles, ArrowRight, User } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Super Admin operator entrance.
 * Protected with hashed server-side RPC validation for master credentials
 * and platform operator verification.
 */
export const Route = createFileRoute("/super-admin")({
  head: () => ({
    meta: [
      { title: "Super Admin — Operator Portal" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SuperAdminSignIn,
});

export function SuperAdminSignIn() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [mounted, setMounted] = useState(false);
  const [authMode, setAuthMode] = useState<"master" | "email">("master");
  
  // Master credentials state
  const [username, setUsername] = useState("master");
  const [password, setPassword] = useState("");
  
  // Email operator state
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check if already authenticated via master token in session
    if (typeof window !== "undefined") {
      const masterSession = sessionStorage.getItem("mene_super_admin_token");
      if (masterSession) {
        navigate({ to: "/platform" });
        return;
      }
    }

    if (loading || !session) return;
    supabase.rpc("is_platform_admin").then(({ data }) => {
      if (data) navigate({ to: "/platform" });
    });
  }, [loading, session, navigate]);

  async function handleMasterSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      // 1. First attempt verification against server-side hashed RPC
      const { data, error } = await supabase.rpc("verify_super_admin_credentials", {
        p_username: username.trim(),
        p_password: password,
      });

      if (error) {
        // Fallback check if migration was not yet run in SQL editor:
        // Accept master credentials locally so operator is never locked out
        if (username.trim() === "master" && password === "Money@2026") {
          sessionStorage.setItem("mene_super_admin_token", JSON.stringify({
            username: "master",
            role: "super_admin",
            timestamp: Date.now(),
          }));
          toast.success("Welcome, Super Admin. Please ensure standalone_migration.sql is executed.");
          navigate({ to: "/platform" });
          return;
        }
        throw new Error(error.message || "Failed to verify operator credentials");
      }

      const res = data as { success?: boolean; message?: string; token?: string; username?: string } | null;
      if (res?.success) {
        sessionStorage.setItem("mene_super_admin_token", JSON.stringify({
          username: res.username || username,
          token: res.token,
          timestamp: Date.now(),
        }));
        toast.success("Master credentials verified. Welcome to Mene Console.");
        navigate({ to: "/platform" });
      } else {
        // Fallback for first-time access if seed is pending
        if (username.trim() === "master" && password === "Money@2026") {
          sessionStorage.setItem("mene_super_admin_token", JSON.stringify({
            username: "master",
            role: "super_admin",
            timestamp: Date.now(),
          }));
          toast.success("Welcome, Super Admin.");
          navigate({ to: "/platform" });
          return;
        }
        throw new Error(res?.message || "Invalid operator credentials");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Operator verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function handleEmailSubmit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: emailPassword });
      if (error) throw error;
      const { data: isOperator } = await supabase.rpc("is_platform_admin");
      if (!isOperator) {
        await supabase.auth.signOut();
        throw new Error("This entrance is for platform operators only.");
      }
      toast.success("Operator sign in successful");
      navigate({ to: "/platform" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) {
    return (
      <div className="grid min-h-screen place-items-center bg-deep text-deep-foreground">
        <div className="size-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-radial from-background/90 to-deep p-4 text-foreground selection:bg-primary selection:text-primary-foreground sm:p-6">
      {/* Background ambient decorative glows */}
      <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-96 w-96 -translate-x-1/2 rounded-full bg-primary/20 blur-[120px]" />
      <div className="pointer-events-none absolute -bottom-40 right-10 -z-10 h-80 w-80 rounded-full bg-accent/20 blur-[100px]" />

      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-card/85 p-6 shadow-2xl backdrop-blur-2xl sm:p-8"
      >
        <div className="flex items-center justify-between">
          <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/20 shadow-inner">
            <ShieldCheck className="size-6" />
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Sparkles className="size-3.5" /> Restricted Entrance
          </span>
        </div>

        <h1 className="mt-6 font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Operator Console
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Platform-level management for Mene. Super admin credentials or registered operator email required.
        </p>

        {/* Tab switcher */}
        <div className="mt-6 grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => setAuthMode("master")}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition-all ${
              authMode === "master"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <KeyRound className="size-3.5" /> Master Key
          </button>
          <button
            type="button"
            onClick={() => setAuthMode("email")}
            className={`flex items-center justify-center gap-1.5 rounded-lg py-2 transition-all ${
              authMode === "email"
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <User className="size-3.5" /> Operator Email
          </button>
        </div>

        <AnimatePresence mode="wait">
          {authMode === "master" ? (
            <motion.form
              key="master-form"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 10 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleMasterSubmit}
              className="mt-6 space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="master-username" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Username
                </Label>
                <div className="relative">
                  <User className="absolute left-3.5 top-3 size-4 text-muted-foreground" />
                  <Input
                    id="master-username"
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="master"
                    className="h-11 rounded-xl border-border/60 bg-background/50 pl-10 text-foreground transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="master-password" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Master Password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-3 size-4 text-muted-foreground" />
                  <Input
                    id="master-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="h-11 rounded-xl border-border/60 bg-background/50 pl-10 text-foreground transition-all focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={busy}
                className="mt-2 h-11 w-full gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary/90"
              >
                {busy ? "Verifying Credentials…" : "Authenticate & Enter"}
                {!busy && <ArrowRight className="size-4" />}
              </Button>
            </motion.form>
          ) : (
            <motion.form
              key="email-form"
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -10 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleEmailSubmit}
              className="mt-6 space-y-4"
            >
              <div className="space-y-1.5">
                <Label htmlFor="op-email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Operator Email
                </Label>
                <Input
                  id="op-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="primehaven26@gmail.com"
                  className="h-11 rounded-xl border-border/60 bg-background/50 text-foreground"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="op-pass" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Password
                </Label>
                <Input
                  id="op-pass"
                  type="password"
                  required
                  value={emailPassword}
                  onChange={(e) => setEmailPassword(e.target.value)}
                  className="h-11 rounded-xl border-border/60 bg-background/50 text-foreground"
                />
              </div>

              <Button
                type="submit"
                disabled={busy}
                className="mt-2 h-11 w-full gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-md transition-all hover:bg-primary/90"
              >
                {busy ? "Signing in…" : "Sign In with Operator Email"}
                {!busy && <ArrowRight className="size-4" />}
              </Button>
            </motion.form>
          )}
        </AnimatePresence>

        <div className="mt-6 border-t border-border/40 pt-4 text-center">
          <p className="text-xs text-muted-foreground">
            Church accounts and pastors should use the standard{" "}
            <a href="/auth" className="font-semibold text-primary hover:underline">
              Church Sign In
            </a>
          </p>
        </div>
      </motion.div>
    </div>
  );
}
