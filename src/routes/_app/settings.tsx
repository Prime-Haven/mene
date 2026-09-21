import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Patmos" },
      { name: "description", content: "Church name, group vocabulary and your public check-in link." },
      { property: "og:title", content: "Settings — Patmos" },
      { property: "og:description", content: "Church name, wording and check-in link." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Settings,
});

function Settings() {
  const { tenant } = useTenant();
  const qc = useQueryClient();
  const [name, setName] = useState(tenant?.name ?? "");
  const [vocab, setVocab] = useState(tenant?.group_vocabulary ?? "Group");

  const save = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("tenants")
        .update({ name: name.trim(), group_vocabulary: vocab.trim() || "Group" })
        .eq("id", tenant!.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["membership"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Could not save"),
  });

  const checkinPath = `/c/${tenant?.subdomain ?? ""}`;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <p className="text-eyebrow">Church</p>
        <h1 className="mt-2 text-2xl font-bold">Settings</h1>
      </div>

      <form
        className="surface space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div className="space-y-2">
          <Label htmlFor="cname">Church name</Label>
          <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="vocab">What you call a group</Label>
          <Input
            id="vocab"
            value={vocab}
            onChange={(e) => setVocab(e.target.value)}
            placeholder="Cell, Unit, Ministry, Zone"
            maxLength={40}
          />
        </div>
        <Button type="submit" disabled={save.isPending}>
          Save changes
        </Button>
      </form>

      <div className="surface space-y-2 p-5">
        <p className="text-eyebrow">Public check-in link</p>
        <p className="font-mono text-sm break-all">{checkinPath}</p>
        <p className="text-sm text-muted-foreground">
          Share this with first-timers, or print it as a QR code at the entrance. It never shows any
          member's details.
        </p>
        <Button asChild variant="outline" size="sm">
          <a href={checkinPath} target="_blank" rel="noopener noreferrer">
            Open check-in form
          </a>
        </Button>
      </div>
    </div>
  );
}
