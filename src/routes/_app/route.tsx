import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
  Menu,
  PanelLeftClose,
  Send,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { InstallMene } from "@/components/InstallMene";
import { getBrandAssetUrl } from "@/lib/checkin.functions";

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
  {
    to: "/messaging",
    label: "Messaging",
    icon: Send,
    show: (c) => c.isAdmin && c.can("broadcasts"),
  },
  {
    to: "/structure",
    label: "Structure",
    icon: Network,
    show: (c) => c.can("structure") && c.isAdmin,
  },
  { to: "/accounts", label: "Accounts", icon: UserCog, show: (c) => c.isAdmin },
  { to: "/billing", label: "Billing", icon: CreditCard, show: (c) => c.isOwner },
  { to: "/audit", label: "Audit log", icon: ScrollText, show: (c) => c.isOwner && c.can("audit") },
  { to: "/settings", label: "Settings", icon: Settings, show: (c) => c.isAdmin },
];

function AppLayout() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const ctx = useTenant();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const reduceMotion = useReducedMotion();
  const loadAsset = useServerFn(getBrandAssetUrl);
  const pendingTenant = ctx.membership?.tenant;
  const { data: logoUrl } = useQuery({
    queryKey: ["sidebar-logo", pendingTenant?.logo_path],
    enabled: !!pendingTenant?.logo_path,
    queryFn: () => loadAsset({ data: { path: pendingTenant!.logo_path! } }),
  });

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
  const Navigation = ({ mobile = false }: { mobile?: boolean }) => (
    <>
      <div className="flex h-16 items-center gap-2.5 border-b border-sidebar-border px-4">
        {logoUrl ? <img src={logoUrl} alt="Church logo" className="size-10 shrink-0 rounded-xl object-contain" /> : <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><QrCode className="size-4.5" /></span>}
        {(!collapsed || mobile) && <span className="min-w-0"><span className="block truncate font-display text-sm font-bold">{tenant.name}</span><span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{tenant.tier}</span></span>}
      </div>
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {nav.filter((item) => item.show(ctx)).map(({ to, label, icon: Icon }) => {
          const active = pathname.startsWith(to);
          return <Link key={to} to={to} onClick={() => mobile && setMobileOpen(false)} title={label} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${active ? "bg-primary text-primary-foreground shadow-[var(--shadow-accent)]" : "text-sidebar-foreground hover:bg-secondary"}`}><Icon className="size-4 shrink-0" />{(!collapsed || mobile) && label}</Link>;
        })}
      </nav>
      <div className="border-t border-sidebar-border p-3">
        {(!collapsed || mobile) && <><InstallMene compact /><p className="px-3 pb-2 pt-3 text-xs capitalize text-muted-foreground">{ctx.role?.replace("_", " ")}</p></>}
        <Button variant="ghost" size="sm" title="Sign out" className={`w-full gap-3 rounded-xl ${collapsed && !mobile ? "justify-center px-0" : "justify-start"}`} onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}><LogOut className="size-4" />{(!collapsed || mobile) && "Sign out"}</Button>
      </div>
    </>
  );

  return (
    <div className="flex min-h-screen bg-background">
      <aside className={`${collapsed ? "w-[72px]" : "w-64"} relative hidden shrink-0 flex-col border-r border-border bg-sidebar transition-[width] duration-200 md:flex`}>
        <Navigation />
        <Button variant="outline" size="icon" className="absolute -right-4 top-20 z-20 size-8 rounded-full bg-background" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}><PanelLeftClose className={`size-4 transition-transform ${collapsed ? "rotate-180" : ""}`} /></Button>
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}><SheetContent side="left" className="flex w-[86vw] max-w-80 flex-col p-0"><SheetTitle className="sr-only">Church navigation</SheetTitle><Navigation mobile /></SheetContent></Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur md:hidden">
          <div className="flex h-16 items-center gap-3 px-4 pt-[env(safe-area-inset-top)]">
            <Button variant="outline" size="icon" className="size-10 shrink-0" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu className="size-5" /></Button>
            <span className="flex items-center gap-2 font-display text-sm font-bold">
              {logoUrl ? <img src={logoUrl} alt="" className="size-8 rounded-lg object-contain" /> : <span className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><QrCode className="size-3.5" /></span>}
              <span className="truncate">{tenant.name}</span>
            </span>
            <span className="ml-auto max-w-28 truncate text-xs font-semibold text-muted-foreground">{current?.label}</span>
          </div>
        </header>

        {suspended && (
          <div className="border-b border-destructive/30 bg-destructive/10 px-5 py-3 text-sm text-destructive">
            This subscription is inactive. Check-in and edits are paused — your records stay safe and
            exports remain available.
          </div>
        )}

        <main className="mx-auto min-w-0 w-full max-w-6xl flex-1 px-4 py-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-7 lg:px-8">
          {current && (
            <p className="text-eyebrow mb-1 hidden lg:block">{current.label}</p>
          )}
          <AnimatePresence mode="wait"><motion.div key={pathname} initial={reduceMotion ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: reduceMotion ? 1 : 0 }} transition={{ duration: reduceMotion ? 0 : 0.18 }}><Outlet /></motion.div></AnimatePresence>
        </main>
      </div>
    </div>
  );
}

