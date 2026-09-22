import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/platform")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Platform console — Mene" },
      { name: "description", content: "Prime Haven staff overview of every church account on Mene." },
      { property: "og:title", content: "Platform console — Mene" },
      { property: "og:description", content: "Staff overview of churches, tiers and revenue." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: Platform,
});

type Overview = {
  tenants: number;
  active_tenants: number;
  members: number;
  attendance_30d: number;
  by_tier: Record<string, number> | null;
  revenue_ghs_90d: number;
  churches: Array<{
    id: string;
    name: string;
    subdomain: string;
    tier: string;
    status: string;
    created_at: string;
    members: number;
  }>;
};

function Platform() {
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["platform-overview"],
    retry: false,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("platform_overview");
      if (error) throw error;
      return data as unknown as Overview;
    },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: "active" | "suspended" }) => {
      const { error } = await supabase.rpc("platform_set_tenant_status", {
        p_tenant: id,
        p_status: status,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["platform-overview"] });
    },
    onError: () => toast.error("Could not update that church"),
  });

  if (isLoading) {
    return <p className="p-10 text-center text-sm text-muted-foreground">Loading…</p>;
  }

  if (error) {
    return (
      <div className="grid min-h-screen place-items-center px-5 text-center">
        <div>
          <h1 className="text-xl font-semibold">Staff access only</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This console is for Prime Haven staff accounts.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link to="/">Back to Mene</Link>
          </Button>
        </div>
      </div>
    );
  }

  const stats = [
    { label: "Churches", value: data!.tenants },
    { label: "Active", value: data!.active_tenants },
    { label: "Members", value: data!.members },
    { label: "Check-ins (30 days)", value: data!.attendance_30d },
    { label: "Revenue 90 days (USD)", value: `$${Number(data!.revenue_ghs_90d).toFixed(2)}` },
  ];

  return (
    <div className="mx-auto max-w-5xl px-5 py-10 space-y-8">
      <div>
        <p className="text-eyebrow">Prime Haven</p>
        <h1 className="mt-2 text-2xl font-bold">Platform console</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {stats.map((s) => (
          <div key={s.label} className="surface p-4">
            <p className="text-eyebrow">{s.label}</p>
            <p className="mt-2 text-xl font-bold">{s.value}</p>
          </div>
        ))}
      </div>

      <div className="surface divide-y divide-border">
        {data!.churches.map((c) => (
          <div key={c.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <p className="font-medium">{c.name}</p>
              <p className="font-mono text-xs text-muted-foreground">
                /c/{c.subdomain} · {c.members} members
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Badge variant="secondary" className="capitalize">
                {c.tier}
              </Badge>
              <Badge variant={c.status === "active" ? "default" : "outline"}>{c.status}</Badge>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setStatus.mutate({
                    id: c.id,
                    status: c.status === "active" ? "suspended" : "active",
                  })
                }
              >
                {c.status === "active" ? "Suspend" : "Restore"}
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
