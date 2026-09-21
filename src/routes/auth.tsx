import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { QrCode } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/auth")({
  validateSearch: z.object({ mode: z.enum(["signin", "signup"]).optional() }),
  head: () => ({
    meta: [
      { title: "Sign in — Patmos" },
      { name: "description", content: "Sign in or create your church account on Patmos." },
      { property: "og:title", content: "Sign in — Patmos" },
      { property: "og:description", content: "Sign in or create your church account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const [isSignUp, setIsSignUp] = useState(mode === "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [busy, setBusy] = useState(false);
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [loading, session, navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/dashboard`,
            data: { full_name: fullName },
          },
        });
        if (error) throw error;
        toast.success("Account created. Check your email to confirm, then sign in.");
        setIsSignUp(false);
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-ink p-12 text-primary-foreground lg:flex">
        <Link to="/" className="flex items-center gap-2 font-bold">
          <span className="grid size-8 place-items-center rounded-md bg-primary">
            <QrCode className="size-4" />
          </span>
          Patmos
        </Link>
        <div>
          <h2 className="max-w-sm text-3xl font-extrabold leading-tight">
            Attendance that still exists on Tuesday morning.
          </h2>
          <p className="mt-4 max-w-sm text-primary-foreground/70">
            Sign in to your church, or create a new one in under two minutes.
          </p>
        </div>
        <p className="text-xs text-primary-foreground/50">
          Prime Haven IT Solutions & Consultancy
        </p>
      </div>

      <div className="flex items-center justify-center px-5 py-16">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold">{isSignUp ? "Create your account" : "Welcome back"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {isSignUp
              ? "You'll set up your church on the next screen."
              : "Sign in to your church workspace."}
          </p>

          <form onSubmit={onSubmit} className="mt-8 space-y-4">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="name">Your full name</Label>
                <Input
                  id="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoComplete="name"
                  required
                  maxLength={120}
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={isSignUp ? "new-password" : "current-password"}
                minLength={8}
                required
              />
              {isSignUp && (
                <p className="text-xs text-muted-foreground">At least 8 characters.</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Please wait…" : isSignUp ? "Create account" : "Sign in"}
            </Button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {isSignUp ? "Already have an account?" : "New to Patmos?"}{" "}
            <button
              type="button"
              className="font-semibold text-primary hover:underline"
              onClick={() => setIsSignUp((v) => !v)}
            >
              {isSignUp ? "Sign in" : "Create one"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
