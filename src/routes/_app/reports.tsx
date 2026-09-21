import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_app/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Patmos" },
      { name: "description", content: "Service attendance, first-timers, absentees and birthday lists." },
      { property: "og:title", content: "Reports — Patmos" },
      { property: "og:description", content: "Attendance and follow-up reports for your church." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Reports,
});

function download(filename: string, rows: Array<Array<string | number>>) {
  const csv = rows
    .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Reports() {
  const { tenant } = useTenant();
  const [serviceId, setServiceId] = useState("");

  const { data: services } = useQuery({
    queryKey: ["all-services", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("services")
        .select("id, name, service_date")
        .order("service_date", { ascending: false })
        .limit(60);
      if (error) throw error;
      if (data?.[0] && !serviceId) setServiceId(data[0].id);
      return data;
    },
  });

  const { data: attendees } = useQuery({
    queryKey: ["service-attendance", serviceId],
    enabled: !!serviceId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("attendance")
        .select("id, method, recorded_at, members(full_name, phone, residential_area)")
        .eq("service_id", serviceId)
        .order("recorded_at");
      if (error) throw error;
      return data;
    },
  });

  const { data: firstTimers } = useQuery({
    queryKey: ["first-timers", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select("id, full_name, phone, residential_area, created_at")
        .eq("status", "first_timer")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data;
    },
  });

  const { data: birthdays } = useQuery({
    queryKey: ["birthdays-report", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("birthdays_this_month", { p_tenant: tenant!.id });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <p className="text-eyebrow">Analytics</p>
        <h1 className="mt-2 text-2xl font-bold">Reports</h1>
      </div>

      <Tabs defaultValue="service">
        <TabsList>
          <TabsTrigger value="service">Service attendance</TabsTrigger>
          <TabsTrigger value="first">First-timers</TabsTrigger>
          <TabsTrigger value="birthdays">Birthdays</TabsTrigger>
        </TabsList>

        <TabsContent value="service" className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={serviceId}
              onChange={(e) => setServiceId(e.target.value)}
            >
              {(services ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.service_date}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                download("service-attendance.csv", [
                  ["Name", "Phone", "Area", "Method", "Recorded at"],
                  ...(attendees ?? []).map((a) => [
                    a.members?.full_name ?? "Anonymised",
                    a.members?.phone ?? "",
                    a.members?.residential_area ?? "",
                    a.method,
                    a.recorded_at,
                  ]),
                ])
              }
            >
              <Download className="size-4" /> CSV
            </Button>
            <span className="text-sm text-muted-foreground">{attendees?.length ?? 0} present</span>
          </div>
          <ReportTable
            head={["Name", "Phone", "Method"]}
            rows={(attendees ?? []).map((a) => [
              a.members?.full_name ?? "Anonymised",
              a.members?.phone ?? "—",
              a.method,
            ])}
          />
        </TabsContent>

        <TabsContent value="first" className="space-y-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              download("first-timers.csv", [
                ["Name", "Phone", "Area", "Captured"],
                ...(firstTimers ?? []).map((m) => [
                  m.full_name,
                  m.phone ?? "",
                  m.residential_area ?? "",
                  m.created_at,
                ]),
              ])
            }
          >
            <Download className="size-4" /> CSV
          </Button>
          <ReportTable
            head={["Name", "Phone", "Area"]}
            rows={(firstTimers ?? []).map((m) => [m.full_name, m.phone ?? "—", m.residential_area ?? "—"])}
          />
        </TabsContent>

        <TabsContent value="birthdays" className="space-y-4">
          <ReportTable
            head={["Name", "Date", "Phone"]}
            rows={(birthdays ?? []).map((b) => [
              b.full_name,
              b.date_of_birth ?? "—",
              b.phone ?? "Hidden",
            ])}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReportTable({ head, rows }: { head: string[]; rows: Array<Array<string | number>> }) {
  return (
    <div className="surface overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="border-b border-border">
          <tr className="text-left">
            {head.map((h) => (
              <th key={h} className="px-4 py-3 font-semibold">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/60 last:border-0">
              {r.map((c, j) => (
                <td key={j} className="px-4 py-2.5">
                  {c}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={head.length} className="px-4 py-10 text-center text-muted-foreground">
                Nothing to show yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
