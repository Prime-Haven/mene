import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageTransition, StaggerItem, StaggerList } from "@/components/Animated";

export const Route = createFileRoute("/_app/my-members")({
  head: () => ({
    meta: [
      { title: "My members — Mene:Log" },
      { name: "description", content: "The members who chose you as their leader." },
      { property: "og:title", content: "My members — Mene:Log" },
      { property: "og:description", content: "Members who chose you as their leader." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MyMembers,
});

type Overview = {
  ok: boolean;
  church?: string;
  full_name?: string;
  member_count?: number;
  first_timers?: number;
  members?: Array<{ id: string; full_name: string; joined_on: string; status: string }>;
};

function MyMembers() {
  const { data, isLoading } = useQuery({
    queryKey: ["leader-overview"],
    queryFn: async () => {
      const { data: result, error } = await supabase.rpc("leader_overview");
      if (error) throw error;
      return result as unknown as Overview;
    },
  });

  const { data: followups } = useQuery({
    queryKey: ["my-followups"],
    queryFn: async () => {
      const { data: rows, error } = await supabase.rpc("my_followups");
      if (error) throw error;
      return rows as unknown as Array<{ member_id: string; full_name: string; phone: string | null; status: string; note: string | null; next_contact_on: string | null }>;
    },
  });

  if (isLoading) {
    return <p className="p-8 text-center text-sm text-muted-foreground">Loading your members…</p>;
  }

  if (!data?.ok) {
    return (
      <p className="surface p-8 text-center text-sm text-muted-foreground">
        This page is for registered leaders.
      </p>
    );
  }

  return (
    <PageTransition className="space-y-6">
      <div>
        <p className="text-eyebrow">{data.church}</p>
        <h1 className="mt-2 font-display text-2xl font-bold">My members</h1>
        <p className="text-sm text-muted-foreground">
          Everyone who chose you when they checked in.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="surface p-5">
          <p className="text-eyebrow">Members</p>
          <p className="mt-2 font-display text-3xl font-bold">{data.member_count ?? 0}</p>
        </div>
        <div className="surface p-5">
          <p className="text-eyebrow">First timers</p>
          <p className="mt-2 font-display text-3xl font-bold">{data.first_timers ?? 0}</p>
        </div>
      </div>

      {followups && followups.length > 0 && (
        <div className="surface divide-y divide-border">
          <div className="p-5"><h2 className="font-display font-bold">People to follow up</h2><p className="text-sm text-muted-foreground">Assigned to you by your church.</p></div>
          {followups.map((f) => (
            <div key={f.member_id} className="p-4 text-sm">
              <p className="font-semibold">{f.full_name}</p>
              <p className="text-muted-foreground capitalize">{f.status.replace("_", " ")}{f.phone ? ` · ${f.phone}` : ""}{f.next_contact_on ? ` · contact by ${f.next_contact_on}` : ""}</p>
              {f.note && <p className="mt-1 text-muted-foreground">{f.note}</p>}
            </div>
          ))}
        </div>
      )}

      <div className="surface divide-y divide-border">
        <div className="flex items-center gap-2 p-5">
          <Users className="size-4 text-primary" />
          <h2 className="font-display font-bold">Your list</h2>
        </div>
        <StaggerList>
          {(data.members ?? []).map((member) => (
            <StaggerItem key={member.id}>
              <div className="flex items-center justify-between gap-3 border-b border-border p-4 last:border-0">
                <p className="font-semibold">{member.full_name}</p>
                <p className="text-sm capitalize text-muted-foreground">
                  {member.status.replace("_", " ")} · joined {member.joined_on}
                </p>
              </div>
            </StaggerItem>
          ))}
        </StaggerList>
        {(data.members ?? []).length === 0 && (
          <p className="p-6 text-center text-sm text-muted-foreground">
            No one has chosen you yet. Ask your members to pick your name when they check in.
          </p>
        )}
      </div>
    </PageTransition>
  );
}
