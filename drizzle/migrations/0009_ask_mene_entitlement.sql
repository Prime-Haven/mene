CREATE OR REPLACE FUNCTION public.tier_entitlements(p_tier public.tenant_tier)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_tier
    WHEN 'basic' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', false, 'ask_mene', true,
      'structure', false, 'groups', false, 'branches', false,
      'email', true, 'sms', false, 'broadcasts', false, 'automations', false,
      'audit', true, 'staff_seats', 3, 'member_limit', 500, 'daily_messages', 200)
    WHEN 'standard' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', true, 'ask_mene', true,
      'structure', true, 'groups', true, 'branches', false,
      'email', true, 'sms', false, 'broadcasts', true, 'automations', true,
      'audit', true, 'staff_seats', 10, 'member_limit', 3000, 'daily_messages', 1000)
    ELSE jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', true, 'ask_mene', true,
      'structure', true, 'groups', true, 'branches', true,
      'email', true, 'sms', true, 'broadcasts', true, 'automations', true,
      'audit', true, 'staff_seats', 40, 'member_limit', 25000, 'daily_messages', 5000)
  END
$$;
REVOKE ALL ON FUNCTION public.tier_entitlements(public.tenant_tier) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tier_entitlements(public.tenant_tier) TO authenticated, service_role;
