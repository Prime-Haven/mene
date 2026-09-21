import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Download, QrCode, Search, Trash2, Upload, UserPlus } from "lucide-react";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_app/members")({
  head: () => ({
    meta: [
      { title: "Members — Patmos" },
      { name: "description", content: "Your church member registry: add, import, issue QR codes and export." },
      { property: "og:title", content: "Members — Patmos" },
      { property: "og:description", content: "Manage your church member registry." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Members,
});

type MemberRow = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  date_of_birth: string | null;
  gender: "male" | "female" | "other" | null;
  residential_area: string | null;
  status: "first_timer" | "active" | "archived" | "anonymised";
  is_minor: boolean;
  position_id: string | null;
};

function Members() {
  const { tenant, membership, isAdmin, canManageMembers } = useTenant();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [qr, setQr] = useState<{ name: string; dataUrl: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    email: "",
    date_of_birth: "",
    gender: "",
    residential_area: "",
  });

  const { data: members, isLoading } = useQuery({
    queryKey: ["members", tenant?.id],
    enabled: !!tenant,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("members")
        .select(
          "id, full_name, phone, email, date_of_birth, gender, residential_area, status, is_minor, position_id",
        )
        .neq("status", "anonymised")
        .order("full_name")
        .limit(2000);
      if (error) throw error;
      return data as MemberRow[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members ?? [];
    return (members ?? []).filter(
      (m) =>
        m.full_name.toLowerCase().includes(q) ||
        (m.phone ?? "").includes(q) ||
        (m.residential_area ?? "").toLowerCase().includes(q),
    );
  }, [members, search]);

  const addMember = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("members").insert({
        tenant_id: tenant!.id,
        branch_id: membership?.branch_id ?? null,
        full_name: form.full_name.trim(),
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        date_of_birth: form.date_of_birth || null,
        gender: (form.gender || null) as MemberRow["gender"],
        residential_area: form.residential_area.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Member added");
      setAddOpen(false);
      setForm({ full_name: "", phone: "", email: "", date_of_birth: "", gender: "", residential_area: "" });
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not add member"),
  });

  const issueQr = useMutation({
    mutationFn: async (member: MemberRow) => {
      const { data, error } = await supabase.rpc("issue_qr_token", { p_member: member.id });
      if (error) throw error;
      const dataUrl = await QRCode.toDataURL(String(data), { width: 420, margin: 1 });
      return { name: member.full_name, dataUrl };
    },
    onSuccess: (res) => setQr(res),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not issue a code"),
  });

  const anonymise = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("anonymise_member", { p_member: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Member anonymised");
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not anonymise"),
  });

  const importRows = useMutation({
    mutationFn: async (file: File) => {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]!]!;
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

      const pick = (row: Record<string, unknown>, keys: string[]) => {
        for (const key of Object.keys(row)) {
          if (keys.includes(key.trim().toLowerCase())) {
            const value = String(row[key] ?? "").trim();
            if (value) return value;
          }
        }
        return "";
      };

      const payload = rows
        .map((row) => ({
          tenant_id: tenant!.id,
          branch_id: membership?.branch_id ?? null,
          full_name: pick(row, ["name", "full name", "fullname", "member name"]),
          phone: pick(row, ["phone", "phone number", "contact", "mobile"]) || null,
          email: pick(row, ["email", "e-mail"]) || null,
          residential_area: pick(row, ["area", "residential area", "location", "address"]) || null,
        }))
        .filter((r) => r.full_name.length > 1);

      if (payload.length === 0) throw new Error("No rows with a name column were found");

      const { data: batch, error: batchError } = await supabase
        .from("import_batches")
        .insert({
          tenant_id: tenant!.id,
          filename: file.name,
          row_count: rows.length,
          inserted_count: payload.length,
          skipped_count: rows.length - payload.length,
        })
        .select("id")
        .single();
      if (batchError) throw batchError;

      const { error } = await supabase
        .from("members")
        .upsert(
          payload.map((p) => ({ ...p, import_batch_id: batch.id })),
          { onConflict: "tenant_id,phone", ignoreDuplicates: true },
        );
      if (error) throw error;
      return payload.length;
    },
    onSuccess: (count) => {
      toast.success(`${count} rows imported`);
      qc.invalidateQueries({ queryKey: ["members"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Import failed"),
  });

  function exportCsv() {
    const rows = filtered.map((m) => [
      m.full_name,
      m.is_minor && !isAdmin ? "" : (m.phone ?? ""),
      m.is_minor && !isAdmin ? "" : (m.email ?? ""),
      m.date_of_birth ?? "",
      m.gender ?? "",
      m.residential_area ?? "",
      m.status,
    ]);
    const csv = [
      ["Name", "Phone", "Email", "Date of birth", "Gender", "Area", "Status"],
      ...rows,
    ]
      .map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${tenant?.subdomain ?? "members"}-registry.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-eyebrow">Registry</p>
          <h1 className="mt-2 text-2xl font-bold">Members</h1>
          <p className="text-sm text-muted-foreground">{members?.length ?? 0} records</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={exportCsv}>
            <Download className="size-4" /> Export CSV
          </Button>
          {canManageMembers && (
            <>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importRows.mutate(file);
                  e.target.value = "";
                }}
              />
              <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importRows.isPending}>
                <Upload className="size-4" /> Import Excel
              </Button>
              <Button onClick={() => setAddOpen(true)}>
                <UserPlus className="size-4" /> Add member
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Search by name, phone or area"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="surface overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border">
            <tr className="text-left">
              <th className="px-4 py-3 font-semibold">Name</th>
              <th className="px-4 py-3 font-semibold">Phone</th>
              <th className="px-4 py-3 font-semibold">Area</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((m) => (
              <tr key={m.id} className="border-b border-border/60 last:border-0">
                <td className="px-4 py-3 font-medium">
                  {m.full_name}
                  {m.is_minor && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      Minor
                    </Badge>
                  )}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {m.is_minor && !isAdmin ? "Hidden" : (m.phone ?? "—")}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{m.residential_area ?? "—"}</td>
                <td className="px-4 py-3">
                  <Badge variant={m.status === "first_timer" ? "default" : "secondary"}>
                    {m.status.replace("_", " ")}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    {canManageMembers && (
                      <Button size="sm" variant="ghost" onClick={() => issueQr.mutate(m)}>
                        <QrCode className="size-4" />
                      </Button>
                    )}
                    {isAdmin && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm(`Anonymise ${m.full_name}? Attendance totals are kept.`))
                            anonymise.mutate(m.id);
                        }}
                      >
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  No members yet. Import your spreadsheet or add someone.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a member</DialogTitle>
            <DialogDescription>Only fields with a pastoral purpose are collected.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              addMember.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="mn">Full name</Label>
              <Input
                id="mn"
                required
                minLength={2}
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mp">Phone</Label>
                <Input
                  id="mp"
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="md">Date of birth</Label>
                <Input
                  id="md"
                  type="date"
                  value={form.date_of_birth}
                  onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })}
                />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="mg">Gender</Label>
                <select
                  id="mg"
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={form.gender}
                  onChange={(e) => setForm({ ...form, gender: e.target.value })}
                >
                  <option value="">Not stated</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ma">Residential area</Label>
                <Input
                  id="ma"
                  value={form.residential_area}
                  onChange={(e) => setForm({ ...form, residential_area: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={addMember.isPending}>
                Add member
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!qr} onOpenChange={(open) => !open && setQr(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{qr?.name}</DialogTitle>
            <DialogDescription>
              Screenshot or print this code. Any previous code for this member stops working.
            </DialogDescription>
          </DialogHeader>
          {qr && <img src={qr.dataUrl} alt="Member QR code" className="mx-auto rounded-md" />}
          <DialogFooter>
            <Button asChild variant="outline">
              <a href={qr?.dataUrl} download={`${qr?.name}-qr.png`}>
                Download
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
