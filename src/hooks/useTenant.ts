import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { ENTITLEMENTS, hasFeature, limitOf, type Feature, type Limit } from "@/lib/entitlements";

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
    approval_status: string;
    trial_ends_at: string | null;
    extra_member_slots: number;
    logo_path: string | null;
    background_path: string | null;
    brand_primary: string;
    brand_accent: string;
    welcome_message: string | null;
    submit_button_text: string;
    group_vocabulary: string;
    reply_to_email: string | null;
    sms_sender_id: string | null;
    quiet_hour_start: number;
    quiet_hour_end: number;
    absence_threshold: number;
  };
};

/** The signed-in user's church membership, role, package and entitlements. */
export function useTenant() {
  const query = useQuery({
    queryKey: ["membership"],
    queryFn: async (): Promise<Membership | null> => {
      const { data, error } = await supabase
        .from("tenant_users")
        .select(
          "id, role, branch_id, position_id, tenant:tenants(id, name, subdomain, tier, status, approval_status, trial_ends_at, extra_member_slots, logo_path, background_path, brand_primary, brand_accent, welcome_message, submit_button_text, group_vocabulary, reply_to_email, sms_sender_id, quiet_hour_start, quiet_hour_end, absence_threshold)",
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
  const isAdmin = role === "owner" || role === "church_admin";

  return {
    ...query,
    membership: query.data ?? null,
    tenant: query.data?.tenant ?? null,
    role,
    tier,
    isAdmin,
    isOwner: role === "owner",
    canManageMembers: isAdmin || role === "branch_admin",
    canSeeReports: role !== "usher" && role !== "leader",
    /** Does this church's package include a capability? */
    can: (feature: Feature) => hasFeature(tier, feature),
    limit: (key: Limit) => limitOf(tier, key),
    /** member_limit plus any extra space this church has purchased; other limits pass through unchanged. */
    limitWithExtras: (key: Limit) =>
      limitOf(tier, key) +
      (key === "member_limit" ? (query.data?.tenant.extra_member_slots ?? 0) : 0),
    features: tier ? ENTITLEMENTS[tier] : null,
    hasStructure: hasFeature(tier, "structure"),
    hasBranches: hasFeature(tier, "branches"),
  };
}
