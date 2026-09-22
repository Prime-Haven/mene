import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Cake, QrCode, TrendingUp, UserPlus, Users } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — Mene" },
      { name: "description", content: "Attendance totals, growth trend and demographics for your church." },
      { property: "og:title", content: "Dashboard — Mene" },
      { property: "og:description", content: "Attendance totals, growth trend and demographics." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Dashboard,
});

type Dash = {
  members: number;
  first_timers_30d: number;
  services: number;
  last_service_attendance: number;
  trend: Array<{ name: string; service_date: string; attendance: number }>;
  gender: Array<{ label: string; value: number }>;
  age_bands: Array<{ label: string; value: number }>;
};

const pieColors = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

function Dashboard() {
  const { tenant } = useTenant();

  const { data } = useQuery({
    queryKey: ["dashboard", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("tenant_dashboard", { p_tenant: tenant!.id });
      if (error) throw error;
      return data as unknown as Dash;
    },
  });

  const { data: birthdays } = useQuery({
    queryKey: ["birthdays", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("birthdays_this_month", { p_tenant: tenant!.id });
      if (error) throw error;
      return data ?? [];
    },
  });

  const trend = [...(data?.trend ?? [])].reverse();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-eyebrow">Overview</p>
          <h1 className="mt-2 text-2xl font-bold">{tenant?.name}</h1>
          <p className="text-sm text-muted-foreground">
            Check-in address: {tenant?.subdomain}.patmos.app
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/members">Members</Link>
          </Button>
          <Button asChild>
            <Link to="/scan">
              <QrCode className="size-4" /> Open scanner
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Members", value: data?.members ?? 0, icon: Users },
          { label: "Last service", value: data?.last_service_attendance ?? 0, icon: TrendingUp },
          { label: "First-timers (30 days)", value: data?.first_timers_30d ?? 0, icon: UserPlus },
          { label: "Services recorded", value: data?.services ?? 0, icon: QrCode },
        ].map(({ label, value, icon: Icon }) => (
          <div key={label} className="surface p-5">
            <div className="flex items-center justify-between">
              <p className="text-eyebrow">{label}</p>
              <Icon className="size-4 text-primary" />
            </div>
            <p className="mt-3 text-3xl font-bold">{value}</p>
          </div>
        ))}
      </div>

      <div className="surface p-5">
        <h2 className="text-base font-semibold">Attendance over the last 12 services</h2>
        <div className="mt-4 h-64">
          {trend.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              No services recorded yet. Create one from the Services screen, then start scanning.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" vertical={false} />
                <XAxis dataKey="service_date" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="attendance" fill="var(--color-chart-1)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="surface p-5">
          <h2 className="text-base font-semibold">Gender split</h2>
          <div className="mt-2 h-52">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data?.gender ?? []} dataKey="value" nameKey="label" outerRadius={72}>
                  {(data?.gender ?? []).map((_, i) => (
                    <Cell key={i} fill={pieColors[i % pieColors.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "var(--color-card)",
                    border: "1px solid var(--color-border)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="surface p-5">
          <h2 className="text-base font-semibold">Age bands</h2>
          <ul className="mt-4 space-y-2 text-sm">
            {(data?.age_bands ?? []).map((band) => (
              <li key={band.label} className="flex items-center justify-between">
                <span className="text-muted-foreground">{band.label}</span>
                <span className="font-semibold">{band.value}</span>
              </li>
            ))}
            {(data?.age_bands ?? []).length === 0 && (
              <li className="text-muted-foreground">No member records yet.</li>
            )}
          </ul>
        </div>

        <div className="surface p-5">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Cake className="size-4 text-primary" /> Birthdays this month
          </h2>
          <ul className="mt-4 space-y-2 text-sm">
            {(birthdays ?? []).slice(0, 8).map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{b.full_name}</span>
                <span className="shrink-0 text-muted-foreground">
                  {b.date_of_birth ? new Date(b.date_of_birth).getDate() : ""}
                </span>
              </li>
            ))}
            {(birthdays ?? []).length === 0 && (
              <li className="text-muted-foreground">Nobody this month.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
