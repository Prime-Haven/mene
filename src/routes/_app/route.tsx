import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import {
  BarChart3,
  CreditCard,
  LayoutDashboard,
  LogOut,
  Network,
  QrCode,
  ScrollText,
  Settings,
  Users,
  CalendarDays,
  UserCog,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});

type NavItem = {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  show: (ctx: ReturnType<typeof useTenant>) => boolean;
};

const nav: NavItem[] = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, show: (c) => c.canSeeReports },
  { to: "/scan", label: "Scan & check in", icon: QrCode, show: () => true },
  { to: "/services", label: "Services", icon: CalendarDays, show: (c) => c.canManageMembers },
  { to: "/members", label: "Members", icon: Users, show: (c) => c.role !== "usher" },
  { to: "/reports", label: "Reports", icon: BarChart3, show: (c) => c.canSeeReports },
  { to: "/structure", label: "Structure", icon: Network, show: (c) => c.hasStructure && c.isAdmin },
  { to: "/accounts", label: "Accounts", icon: UserCog, show: (c) => c.isAdmin },
  { to: "/billing", label: "Billing", icon: CreditCard, show: (c) => c.isOwner },
  { to: "/audit", label: "Audit log", icon: ScrollText, show: (c) => c.isOwner },
  { to: "/settings", label: "Settings", icon: Settings, show: (c) => c.isAdmin },
];

function AppLayout() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const ctx = useTenant();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth" });
  }, [loading, session, navigate]);

  useEffect(() => {
    if (session && !ctx.isLoading && !ctx.membership) navigate({ to: "/onboarding" });
  }, [session, ctx.isLoading, ctx.membership, navigate]);

  if (loading || ctx.isLoading || !ctx.membership) {
    return (
      <div className="grid min-h-screen place-items-center text-sm text-muted-foreground">
        Loading your church…
      </div>
    );
  }

  const tenant = ctx.membership.tenant;
  const suspended = tenant.status === "suspended" || tenant.status === "closed";

  const current = nav.find((item) => pathname.startsWith(item.to));

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border bg-sidebar lg:flex">
        <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-[var(--shadow-accent)]">
            <QrCode className="size-4.5" />
          </span>
          <span className="min-w-0">
            <span className="block truncate font-display text-sm font-bold">{tenant.name}</span>
            <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              {tenant.tier}
            </span>
          </span>
        </div>
        <nav className="flex-1 space-y-1 p-3">
          {nav
            .filter((item) => item.show(ctx))
            .map(({ to, label, icon: Icon }) => {
              const active = pathname.startsWith(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground shadow-[var(--shadow-accent)]"
                      : "text-sidebar-foreground hover:bg-secondary"
                  }`}
                >
                  <Icon className="size-4" />
                  {label}
                </Link>
              );
            })}
        </nav>
        <div className="border-t border-sidebar-border p-3">
          <p className="px-3 pb-2 text-xs capitalize text-muted-foreground">
            {ctx.role?.replace("_", " ")}
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-3 rounded-xl"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="size-4" /> Sign out
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur lg:hidden">
          <div className="flex h-14 items-center justify-between px-4">
            <span className="flex items-center gap-2 font-display text-sm font-bold">
              <span className="grid size-7 place-items-center rounded-lg bg-primary text-primary-foreground">
                <QrCode className="size-3.5" />
              </span>
              <span className="truncate">{tenant.name}</span>
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={async () => {
                await supabase.auth.signOut();
                navigate({ to: "/auth" });
              }}
            >
              <LogOut className="size-4" />
            </Button>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto px-3 pb-2">
            {nav
              .filter((item) => item.show(ctx))
              .map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                    pathname.startsWith(to)
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground"
                  }`}
                >
                  <Icon className="size-3.5" />
                  {label}
                </Link>
              ))}
          </div>
        </header>

        {suspended && (
          <div className="border-b border-destructive/30 bg-destructive/10 px-5 py-3 text-sm text-destructive">
            This subscription is inactive. Check-in and edits are paused — your records stay safe and
            exports remain available.
          </div>
        )}

        <main className="mx-auto min-w-0 w-full max-w-6xl flex-1 px-5 py-7 sm:px-8">
          {current && (
            <p className="text-eyebrow mb-1 hidden lg:block">{current.label}</p>
          )}
          <Outlet />
        </main>
      </div>
    </div>
  );
}

