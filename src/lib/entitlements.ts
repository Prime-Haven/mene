/**
 * The single place that decides what each package includes.
 * The database mirrors this exactly in public.tier_entitlements(), so the
 * browser and the server can never disagree. Change both together.
 */
export type Tier = "basic" | "standard" | "premium";

export type Feature =
  | "members"
  | "services"
  | "checkin"
  | "qr"
  | "branding"
  | "reports_basic"
  | "reports_advanced"
  | "structure"
  | "groups"
  | "branches"
  | "email"
  | "sms"
  | "broadcasts"
  | "automations"
  | "audit";

export type Limit = "staff_seats" | "member_limit" | "daily_messages";

type Entitlement = Record<Feature, boolean> & Record<Limit, number>;

export const ENTITLEMENTS: Record<Tier, Entitlement> = {
  basic: {
    members: true,
    services: true,
    checkin: true,
    qr: true,
    branding: true,
    reports_basic: true,
    reports_advanced: false,
    structure: false,
    groups: false,
    branches: false,
    email: true,
    sms: false,
    broadcasts: false,
    automations: false,
    audit: true,
    staff_seats: 3,
    member_limit: 500,
    daily_messages: 200,
  },
  standard: {
    members: true,
    services: true,
    checkin: true,
    qr: true,
    branding: true,
    reports_basic: true,
    reports_advanced: true,
    structure: true,
    groups: true,
    branches: false,
    email: true,
    sms: false,
    broadcasts: true,
    automations: true,
    audit: true,
    staff_seats: 10,
    member_limit: 3000,
    daily_messages: 1000,
  },
  premium: {
    members: true,
    services: true,
    checkin: true,
    qr: true,
    branding: true,
    reports_basic: true,
    reports_advanced: true,
    structure: true,
    groups: true,
    branches: true,
    email: true,
    sms: true,
    broadcasts: true,
    automations: true,
    audit: true,
    staff_seats: 40,
    member_limit: 25000,
    daily_messages: 5000,
  },
};

export function hasFeature(tier: Tier | undefined, feature: Feature): boolean {
  if (!tier) return false;
  return ENTITLEMENTS[tier][feature] === true;
}

export function limitOf(tier: Tier | undefined, key: Limit): number {
  if (!tier) return 0;
  return ENTITLEMENTS[tier][key];
}

/** Plain-language label for each locked capability, used in upgrade panels. */
export const FEATURE_LABELS: Record<Feature, string> = {
  members: "Member registry",
  services: "Services",
  checkin: "Check-in",
  qr: "Member QR codes",
  branding: "Church branding",
  reports_basic: "Reports",
  reports_advanced: "Advanced reports",
  structure: "Leadership structure",
  groups: "Groups",
  branches: "Multiple branches",
  email: "Email",
  sms: "Text messages",
  broadcasts: "Broadcasts",
  automations: "Automatic messages",
  audit: "Activity log",
};

/** The cheapest package that unlocks a capability. */
export function requiredTier(feature: Feature): Tier {
  if (ENTITLEMENTS.basic[feature]) return "basic";
  if (ENTITLEMENTS.standard[feature]) return "standard";
  return "premium";
}
