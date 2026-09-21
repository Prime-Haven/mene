import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

export type AppRole = Database["public"]["Enums"]["app_role"];
export type Tier = Database["public"]["Enums"]["tenant_tier"];

export type Membership = {
  id: string;
  role: AppRole;
  branch_id: string | null;
  position_id: string | null;
  tenant: {
    id: string;
    name: string;
    subdomain: string;
    tier: Tier;
    status: Database["public"]["Enums"]["tenant_status"];
    logo_path: string | null;
    background_path: string | null;
    brand_primary: string;
    brand_accent: string;
    welcome_message: string | null;
    submit_button_text: string;
    group_vocabulary: string;
  };
};

/** The signed-in user's church membership, role and tier. */
export function useTenant() {
  const query = useQuery({
    queryKey: ["membership"],
    queryFn: async (): Promise<Membership | null> => {
      const { data, error } = await supabase
        .from("tenant_users")
        .select(
          "id, role, branch_id, position_id, tenant:tenants(id, name, subdomain, tier, status, logo_path, background_path, brand_primary, brand_accent, welcome_message, submit_button_text, group_vocabulary)",
        )
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1);
      if (error) throw error;
      const row = data?.[0];
      if (!row || !row.tenant) return null;
      return row as unknown as Membership;
    },
  });

  const role = query.data?.role;
  const tier = query.data?.tenant.tier;

  return {
    ...query,
    membership: query.data ?? null,
    tenant: query.data?.tenant ?? null,
    role,
    tier,
    isAdmin: role === "owner" || role === "church_admin",
    isOwner: role === "owner",
    canManageMembers: role === "owner" || role === "church_admin" || role === "branch_admin",
    canSeeReports: role !== "usher",
    hasStructure: tier === "standard" || tier === "premium",
    hasBranches: tier === "premium",
  };
}
