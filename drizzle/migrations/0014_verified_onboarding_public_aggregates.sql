CREATE OR REPLACE FUNCTION public.provision_tenant(
  p_name text, p_subdomain text, p_tier public.tenant_tier,
  p_contact_email text DEFAULT NULL, p_contact_phone text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_branch uuid; v_sub text; v_start date := current_date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = auth.uid() AND email_confirmed_at IS NOT NULL) THEN
    RAISE EXCEPTION 'Confirm your email before creating your church';
  END IF;
  IF NOT public.check_rate_limit('provision_tenant', auth.uid()::text, 5, 3600) THEN
    RAISE EXCEPTION 'Too many attempts. Please try again later.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'This account already belongs to a church';
  END IF;
  v_sub := lower(trim(p_subdomain));
  IF NOT public.subdomain_available(v_sub) THEN RAISE EXCEPTION 'That check-in address is not available'; END IF;
  IF length(trim(coalesce(p_name,''))) < 2 OR length(trim(p_name)) > 120 THEN RAISE EXCEPTION 'Church name must be 2 to 120 characters'; END IF;
  BEGIN
    INSERT INTO public.tenants (name, subdomain, tier, contact_email, contact_phone, approval_status, status, trial_ends_at)
    VALUES (trim(p_name), v_sub, p_tier, nullif(trim(p_contact_email),''), public.normalize_phone_gh(p_contact_phone), 'pending_approval', 'active', now() + interval '14 days')
    RETURNING id INTO v_tenant;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That check-in address is already taken';
  END;
  INSERT INTO public.branches (tenant_id, name, is_default) VALUES (v_tenant, 'Main', true) RETURNING id INTO v_branch;
  INSERT INTO public.tenant_users (tenant_id, user_id, role, branch_id) VALUES (v_tenant, auth.uid(), 'owner', v_branch);
  INSERT INTO public.subscriptions (tenant_id, tier, period_start, period_end) VALUES (v_tenant, p_tier, v_start, v_start + 14);
  IF p_tier IN ('standard','premium') THEN
    INSERT INTO public.structure_levels (tenant_id, name, rank) VALUES (v_tenant, 'Leader', 1);
  END IF;
  PERFORM public.log_audit(v_tenant, 'tenant.provisioned', v_sub, jsonb_build_object('tier', p_tier, 'trial_days', 14));
  RETURN v_tenant;
END; $$;
REVOKE ALL ON FUNCTION public.provision_tenant(text,text,public.tenant_tier,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.provision_tenant(text,text,public.tenant_tier,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.complete_verified_onboarding()
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user auth.users;
  v_meta jsonb;
  v_tier public.tenant_tier;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO v_user FROM auth.users WHERE id = auth.uid();
  IF v_user.id IS NULL OR v_user.email_confirmed_at IS NULL THEN RAISE EXCEPTION 'Confirm your email before continuing'; END IF;
  SELECT tenant_id INTO STRICT v_user.id FROM public.tenant_users WHERE user_id = auth.uid() LIMIT 1;
  RETURN v_user.id;
EXCEPTION WHEN no_data_found THEN
  SELECT * INTO v_user FROM auth.users WHERE id = auth.uid();
  v_meta := coalesce(v_user.raw_user_meta_data, '{}'::jsonb);
  IF coalesce(v_meta->>'onboarding_version','') <> '1' THEN RAISE EXCEPTION 'Onboarding details are missing. Please restart registration.'; END IF;
  IF coalesce(v_meta->>'tier','') NOT IN ('basic','standard','premium') THEN RAISE EXCEPTION 'Invalid package selection'; END IF;
  v_tier := (v_meta->>'tier')::public.tenant_tier;
  RETURN public.provision_tenant(
    v_meta->>'church_name',
    v_meta->>'subdomain',
    v_tier,
    coalesce(nullif(v_meta->>'church_email',''), v_user.email),
    coalesce(nullif(v_meta->>'church_phone',''), nullif(v_meta->>'phone',''))
  );
END; $$;
REVOKE ALL ON FUNCTION public.complete_verified_onboarding() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.complete_verified_onboarding() TO authenticated;

CREATE OR REPLACE FUNCTION public.public_platform_stats()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH sunday_totals AS (
    SELECT recorded_at::date AS sunday, count(*)::bigint AS total
    FROM public.attendance
    WHERE extract(isodow from recorded_at) = 7
      AND recorded_at >= now() - interval '12 weeks'
    GROUP BY recorded_at::date
  )
  SELECT jsonb_build_object(
    'churches', (SELECT count(*)::bigint FROM public.tenants WHERE approval_status = 'approved' AND status IN ('active','grace')),
    'members', (SELECT count(*)::bigint FROM public.members WHERE status IN ('active','first_timer')),
    'checkins', (SELECT count(*)::bigint FROM public.attendance),
    'average_sunday_attendance', coalesce((SELECT round(avg(total))::bigint FROM sunday_totals), 0),
    'updated_at', now()
  );
$$;
REVOKE ALL ON FUNCTION public.public_platform_stats() FROM public;
GRANT EXECUTE ON FUNCTION public.public_platform_stats() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.public_help_allow_request(p_identifier text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF length(coalesce(p_identifier,'')) < 16 OR length(p_identifier) > 128 THEN RETURN false; END IF;
  IF NOT public.check_rate_limit('public_help_client', p_identifier, 10, 3600) THEN RETURN false; END IF;
  IF NOT public.check_rate_limit('public_help_global', 'all', 1000, 3600) THEN RETURN false; END IF;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.public_help_allow_request(text) FROM public;
GRANT EXECUTE ON FUNCTION public.public_help_allow_request(text) TO anon, service_role;