import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Lock, Unlock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/services")({
  head: () => ({
    meta: [
      { title: "Services — Patmos" },
      { name: "description", content: "Create services and open or close them for attendance capture." },
      { property: "og:title", content: "Services — Patmos" },
      { property: "og:description", content: "Create and manage your church services." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Services,
});

function Services() {
  const { tenant, membership } = useTenant();
  const qc = useQueryClient();
  const [name, setName] = useState("Sunday Service");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  const { data: services } = useQuery({
    queryKey: ["services", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, service_date, is_open, attendance(count)")
        .order("service_date", { ascending: false })
        .limit(60);
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("services").insert({
        tenant_id: tenant!.id,
        branch_id: membership?.branch_id ?? null,
        name,
        service_date: date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Service created");
      qc.invalidateQueries({ queryKey: ["services"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not create service"),
  });

  const toggle = useMutation({
    mutationFn: async ({ id, is_open }: { id: string; is_open: boolean }) => {
      const { error } = await supabase.from("services").update({ is_open }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["services"] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not update service"),
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-eyebrow">Attendance</p>
        <h1 className="mt-2 text-2xl font-bold">Services</h1>
        <p className="text-sm text-muted-foreground">
          Attendance is recorded against a service. Close a service to stop further scans.
        </p>
      </div>

      <form
        className="surface grid gap-4 p-5 sm:grid-cols-[1fr_auto_auto] sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="sname">Service name</Label>
          <Input id="sname" value={name} onChange={(e) => setName(e.target.value)} required maxLength={80} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sdate">Date</Label>
          <Input id="sdate" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </div>
        <Button type="submit" disabled={create.isPending}>
          Add service
        </Button>
      </form>

      <div className="surface divide-y divide-border">
        {(services ?? []).map((s) => {
          const count = (s.attendance as unknown as Array<{ count: number }>)?.[0]?.count ?? 0;
          return (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">{s.name}</p>
                <p className="text-sm text-muted-foreground">
                  {s.service_date} · {count} recorded
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toggle.mutate({ id: s.id, is_open: !s.is_open })}
              >
                {s.is_open ? (
                  <>
                    <Lock className="size-4" /> Close
                  </>
                ) : (
                  <>
                    <Unlock className="size-4" /> Reopen
                  </>
                )}
              </Button>
            </div>
          );
        })}
        {(services ?? []).length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">No services yet.</p>
        )}
      </div>
    </div>
  );
}
