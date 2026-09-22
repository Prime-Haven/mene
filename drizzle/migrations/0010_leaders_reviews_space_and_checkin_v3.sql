-- ============================================================
-- 1. Additive columns
-- ============================================================
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS education_level text;
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS invited_by_leader_id uuid;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS extra_member_slots integer NOT NULL DEFAULT 0;

-- ============================================================
-- 2. Entitlements: leaders + paid member-space add-on
-- ============================================================
CREATE OR REPLACE FUNCTION public.tier_entitlements(p_tier public.tenant_tier)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_tier
    WHEN 'basic' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', false, 'ask_mene', true,
      'structure', false, 'groups', false, 'branches', false,
      'leaders', false, 'space_addon', false,
      'email', true, 'sms', false, 'broadcasts', false, 'automations', false,
      'audit', true, 'staff_seats', 3, 'member_limit', 500, 'daily_messages', 200)
    WHEN 'standard' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', true, 'ask_mene', true,
      'structure', true, 'groups', true, 'branches', false,
      'leaders', true, 'space_addon', true,
      'email', true, 'sms', false, 'broadcasts', true, 'automations', true,
      'audit', true, 'staff_seats', 10, 'member_limit', 3000, 'daily_messages', 1000)
    ELSE jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', true, 'ask_mene', true,
      'structure', true, 'groups', true, 'branches', true,
      'leaders', true, 'space_addon', true,
      'email', true, 'sms', true, 'broadcasts', true, 'automations', true,
      'audit', true, 'staff_seats', 40, 'member_limit', 25000, 'daily_messages', 5000)
  END
$$;
REVOKE ALL ON FUNCTION public.tier_entitlements(public.tenant_tier) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tier_entitlements(public.tenant_tier) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tenant_limit(_tenant uuid, _key text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((public.tier_entitlements(t.tier) ->> _key)::int, 0)
       + CASE WHEN _key = 'member_limit' THEN coalesce(t.extra_member_slots, 0) ELSE 0 END
  FROM public.tenants t WHERE t.id = _tenant
$$;
REVOKE ALL ON FUNCTION public.tenant_limit(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tenant_limit(uuid, text) TO authenticated, service_role;

-- ============================================================
-- 3. Leader types (admin-defined list)
-- ============================================================
CREATE TABLE public.leader_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);
CREATE INDEX leader_types_tenant_idx ON public.leader_types (tenant_id, name);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leader_types TO authenticated;
GRANT ALL ON public.leader_types TO service_role;
ALTER TABLE public.leader_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant members read leader types" ON public.leader_types
  FOR SELECT TO authenticated USING (public.is_tenant_member(tenant_id));
CREATE POLICY "tenant admins add leader types" ON public.leader_types
  FOR INSERT TO authenticated WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "tenant admins edit leader types" ON public.leader_types
  FOR UPDATE TO authenticated USING (public.is_tenant_admin(tenant_id))
  WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "tenant admins remove leader types" ON public.leader_types
  FOR DELETE TO authenticated USING (public.is_tenant_admin(tenant_id));

-- ============================================================
-- 4. Leader profiles
-- ============================================================
CREATE TABLE public.leader_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL,
  email citext,
  phone text,
  photo_path text,
  date_of_birth date,
  location text,
  leader_type_id uuid REFERENCES public.leader_types(id) ON DELETE SET NULL,
  status public.account_status NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id)
);
CREATE INDEX leader_profiles_tenant_idx ON public.leader_profiles (tenant_id, status);
CREATE INDEX leader_profiles_user_idx ON public.leader_profiles (user_id);
GRANT SELECT, UPDATE, DELETE ON public.leader_profiles TO authenticated;
GRANT ALL ON public.leader_profiles TO service_role;
ALTER TABLE public.leader_profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "leaders read own profile" ON public.leader_profiles
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "tenant admins read leaders" ON public.leader_profiles
  FOR SELECT TO authenticated USING (public.is_tenant_admin(tenant_id));
CREATE POLICY "tenant admins edit leaders" ON public.leader_profiles
  FOR UPDATE TO authenticated USING (public.is_tenant_admin(tenant_id))
  WITH CHECK (public.is_tenant_admin(tenant_id));
CREATE POLICY "tenant admins remove leaders" ON public.leader_profiles
  FOR DELETE TO authenticated USING (public.is_tenant_admin(tenant_id));

ALTER TABLE public.members
  ADD CONSTRAINT members_invited_by_leader_fkey
  FOREIGN KEY (invited_by_leader_id) REFERENCES public.leader_profiles(id) ON DELETE SET NULL;
CREATE INDEX members_invited_by_leader_idx ON public.members (invited_by_leader_id);

CREATE POLICY "leaders read members they invited" ON public.members
  FOR SELECT TO authenticated USING (
    invited_by_leader_id IN (SELECT id FROM public.leader_profiles WHERE user_id = auth.uid())
  );

-- ============================================================
-- 5. Leader access code (anti-spam, admin controlled)
-- ============================================================
CREATE TABLE public.tenant_leader_access (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  code text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
GRANT SELECT ON public.tenant_leader_access TO authenticated;
GRANT ALL ON public.tenant_leader_access TO service_role;
ALTER TABLE public.tenant_leader_access ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant admins read leader code" ON public.tenant_leader_access
  FOR SELECT TO authenticated USING (public.is_tenant_admin(tenant_id));

CREATE OR REPLACE FUNCTION public.set_leader_access_code(p_tenant uuid, p_code text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text;
BEGIN
  IF NOT public.is_tenant_admin(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF NOT public.tenant_has_feature(p_tenant, 'leaders') THEN
    RAISE EXCEPTION 'Leader accounts are not part of this package';
  END IF;
  v_code := nullif(btrim(coalesce(p_code, '')), '');
  IF v_code IS NULL THEN v_code := upper(encode(gen_random_bytes(4), 'hex')); END IF;
  IF length(v_code) < 6 OR length(v_code) > 24 THEN
    RAISE EXCEPTION 'The access code must be between 6 and 24 characters';
  END IF;
  INSERT INTO public.tenant_leader_access (tenant_id, code, updated_by)
  VALUES (p_tenant, v_code, auth.uid())
  ON CONFLICT (tenant_id) DO UPDATE
    SET code = excluded.code, updated_at = now(), updated_by = excluded.updated_by;
  PERFORM public.log_audit(p_tenant, 'leaders.access_code_set', null, '{}'::jsonb, null, auth.uid());
  RETURN v_code;
END; $$;
REVOKE ALL ON FUNCTION public.set_leader_access_code(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_leader_access_code(uuid, text) TO authenticated;

-- ============================================================
-- 6. Public (server-side only) leader lookups for the check-in page
-- ============================================================
CREATE OR REPLACE FUNCTION public.public_leader_options(p_subdomain text)
RETURNS TABLE(id uuid, full_name text, leader_type text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lp.id, lp.full_name, lt.name
  FROM public.leader_profiles lp
  JOIN public.tenants t ON t.id = lp.tenant_id
  LEFT JOIN public.leader_types lt ON lt.id = lp.leader_type_id
  WHERE t.subdomain = lower(btrim(coalesce(p_subdomain, '')))
    AND lp.status = 'active'
    AND public.tenant_has_feature(t.id, 'leaders')
  ORDER BY lp.full_name
  LIMIT 500
$$;
REVOKE ALL ON FUNCTION public.public_leader_options(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_leader_options(text) TO service_role;

CREATE OR REPLACE FUNCTION public.public_leader_types(p_subdomain text)
RETURNS TABLE(id uuid, name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lt.id, lt.name
  FROM public.leader_types lt
  JOIN public.tenants t ON t.id = lt.tenant_id
  WHERE t.subdomain = lower(btrim(coalesce(p_subdomain, '')))
    AND public.tenant_has_feature(t.id, 'leaders')
  ORDER BY lt.name
  LIMIT 200
$$;
REVOKE ALL ON FUNCTION public.public_leader_types(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_leader_types(text) TO service_role;

-- ============================================================
-- 7. Leader registration (verified server-side, access code required)
-- ============================================================
CREATE OR REPLACE FUNCTION public.register_leader(
  p_subdomain text, p_user uuid, p_code text, p_full_name text, p_email text,
  p_phone text, p_dob date, p_location text, p_leader_type uuid, p_photo_path text, p_ip text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant record; v_code text; v_leader uuid; v_phone text;
BEGIN
  SELECT * INTO v_tenant FROM public.tenants
   WHERE subdomain = lower(btrim(coalesce(p_subdomain, '')));
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Church not found'; END IF;
  IF v_tenant.status NOT IN ('active','grace') THEN RAISE EXCEPTION 'This church is not accepting leader sign-ups right now'; END IF;
  IF NOT public.tenant_has_feature(v_tenant.id, 'leaders') THEN
    RAISE EXCEPTION 'Leader accounts are not part of this package';
  END IF;
  IF NOT public.check_rate_limit('leader_register_ip', coalesce(p_ip, 'unknown'), 5, 3600) THEN
    RAISE EXCEPTION 'Too many attempts from this device. Please try again later.';
  END IF;
  SELECT code INTO v_code FROM public.tenant_leader_access WHERE tenant_id = v_tenant.id;
  IF v_code IS NULL THEN RAISE EXCEPTION 'Ask your church administrator for the leader access code'; END IF;
  IF upper(btrim(coalesce(p_code, ''))) <> upper(v_code) THEN
    RAISE EXCEPTION 'That leader access code is not correct';
  END IF;
  IF length(btrim(coalesce(p_full_name, ''))) < 2 OR length(p_full_name) > 120 THEN
    RAISE EXCEPTION 'Please enter your full name';
  END IF;
  IF p_leader_type IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.leader_types WHERE id = p_leader_type AND tenant_id = v_tenant.id
  ) THEN RAISE EXCEPTION 'Please choose a valid type of leader'; END IF;
  v_phone := public.normalize_phone_gh(p_phone);

  INSERT INTO public.leader_profiles (
    tenant_id, user_id, full_name, email, phone, photo_path, date_of_birth, location, leader_type_id
  ) VALUES (
    v_tenant.id, p_user, btrim(p_full_name), nullif(btrim(coalesce(p_email,'')),''), v_phone,
    nullif(btrim(coalesce(p_photo_path,'')),''), p_dob, nullif(btrim(coalesce(p_location,'')),''), p_leader_type
  )
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET full_name = excluded.full_name
  RETURNING id INTO v_leader;

  INSERT INTO public.tenant_users (tenant_id, user_id, role, status)
  VALUES (v_tenant.id, p_user, 'leader', 'active')
  ON CONFLICT DO NOTHING;

  PERFORM public.log_audit(v_tenant.id, 'leader.registered', v_leader::text, '{}'::jsonb, p_ip, p_user);
  RETURN jsonb_build_object('ok', true, 'leader_id', v_leader, 'church', v_tenant.name);
END; $$;
REVOKE ALL ON FUNCTION public.register_leader(text,uuid,text,text,text,text,date,text,uuid,text,text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_leader(text,uuid,text,text,text,text,date,text,uuid,text,text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.leader_overview()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_leader record; v_result jsonb;
BEGIN
  SELECT lp.*, t.name AS church_name INTO v_leader
  FROM public.leader_profiles lp JOIN public.tenants t ON t.id = lp.tenant_id
  WHERE lp.user_id = auth.uid() LIMIT 1;
  IF v_leader IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  SELECT jsonb_build_object(
    'ok', true,
    'church', v_leader.church_name,
    'full_name', v_leader.full_name,
    'member_count', (SELECT count(*) FROM public.members m WHERE m.invited_by_leader_id = v_leader.id),
    'first_timers', (SELECT count(*) FROM public.members m WHERE m.invited_by_leader_id = v_leader.id AND m.status = 'first_timer'),
    'members', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', m.id, 'full_name', m.full_name, 'joined_on', m.joined_on, 'status', m.status)
             ORDER BY m.joined_on DESC)
      FROM (SELECT * FROM public.members m2 WHERE m2.invited_by_leader_id = v_leader.id
            ORDER BY joined_on DESC LIMIT 200) m
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END; $$;
REVOKE ALL ON FUNCTION public.leader_overview() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.leader_overview() TO authenticated;

-- ============================================================
-- 8. Church reviews (one per administrator, operator approved)
-- ============================================================
CREATE TABLE public.church_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  quote text NOT NULL,
  author_name text NOT NULL,
  author_role text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz
);
CREATE INDEX church_reviews_status_idx ON public.church_reviews (status, created_at DESC);
GRANT SELECT ON public.church_reviews TO authenticated;
GRANT ALL ON public.church_reviews TO service_role;
ALTER TABLE public.church_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authors read own review" ON public.church_reviews
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "platform admins read reviews" ON public.church_reviews
  FOR SELECT TO authenticated USING (public.is_platform_admin());

CREATE OR REPLACE FUNCTION public.submit_church_review(
  p_tenant uuid, p_rating smallint, p_quote text, p_author_name text, p_author_role text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_tenant_admin(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF p_rating IS NULL OR p_rating < 1 OR p_rating > 5 THEN RAISE EXCEPTION 'Please choose a rating from 1 to 5'; END IF;
  IF length(btrim(coalesce(p_quote,''))) < 20 OR length(p_quote) > 600 THEN
    RAISE EXCEPTION 'Please write between 20 and 600 characters';
  END IF;
  IF EXISTS (SELECT 1 FROM public.church_reviews WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'You have already shared a review';
  END IF;
  INSERT INTO public.church_reviews (tenant_id, user_id, rating, quote, author_name, author_role)
  VALUES (p_tenant, auth.uid(), p_rating, btrim(p_quote),
          coalesce(nullif(btrim(coalesce(p_author_name,'')),''), 'Church leader'),
          nullif(btrim(coalesce(p_author_role,'')),''))
  RETURNING id INTO v_id;
  PERFORM public.log_audit(p_tenant, 'review.submitted', v_id::text, '{}'::jsonb, null, auth.uid());
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;
REVOKE ALL ON FUNCTION public.submit_church_review(uuid, smallint, text, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.submit_church_review(uuid, smallint, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.my_review_state()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(
    (SELECT jsonb_build_object('submitted', true, 'status', status, 'created_at', created_at)
     FROM public.church_reviews WHERE user_id = auth.uid()),
    jsonb_build_object('submitted', false))
$$;
REVOKE ALL ON FUNCTION public.my_review_state() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.my_review_state() TO authenticated;

CREATE OR REPLACE FUNCTION public.public_reviews()
RETURNS TABLE(id uuid, rating smallint, quote text, author_name text, author_role text, church_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.rating, r.quote, r.author_name, r.author_role, t.name
  FROM public.church_reviews r JOIN public.tenants t ON t.id = r.tenant_id
  WHERE r.status = 'approved'
  ORDER BY r.reviewed_at DESC NULLS LAST, r.created_at DESC
  LIMIT 30
$$;
REVOKE ALL ON FUNCTION public.public_reviews() FROM public;
GRANT EXECUTE ON FUNCTION public.public_reviews() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_set_review_status(p_review uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF p_status NOT IN ('pending','approved','rejected') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  UPDATE public.church_reviews SET status = p_status, reviewed_at = now() WHERE id = p_review;
  INSERT INTO public.platform_audit_events (actor_user_id, action, detail)
  VALUES (auth.uid(), 'review.' || p_status, jsonb_build_object('review_id', p_review));
END; $$;
REVOKE ALL ON FUNCTION public.platform_set_review_status(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_review_status(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_reviews()
RETURNS TABLE(id uuid, rating smallint, quote text, author_name text, author_role text,
              status text, created_at timestamptz, church_name text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.id, r.rating, r.quote, r.author_name, r.author_role, r.status, r.created_at, t.name
  FROM public.church_reviews r JOIN public.tenants t ON t.id = r.tenant_id
  WHERE public.is_platform_admin()
  ORDER BY r.created_at DESC
  LIMIT 200
$$;
REVOKE ALL ON FUNCTION public.platform_reviews() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_reviews() TO authenticated;

-- ============================================================
-- 9. Extra member space (paid add-on)
-- ============================================================
CREATE TABLE public.space_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  extra_slots integer NOT NULL CHECK (extra_slots > 0),
  amount_cents bigint NOT NULL DEFAULT 0,
  reference text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz
);
CREATE INDEX space_requests_tenant_idx ON public.space_requests (tenant_id, created_at DESC);
GRANT SELECT ON public.space_requests TO authenticated;
GRANT ALL ON public.space_requests TO service_role;
ALTER TABLE public.space_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant admins read space requests" ON public.space_requests
  FOR SELECT TO authenticated USING (public.is_tenant_admin(tenant_id));

CREATE OR REPLACE FUNCTION public.request_extra_space(p_tenant uuid, p_slots integer, p_reference text, p_amount bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT public.is_tenant_admin(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF NOT public.tenant_has_feature(p_tenant, 'space_addon') THEN
    RAISE EXCEPTION 'Extra member space is available on the Standard and Premium packages';
  END IF;
  IF p_slots IS NULL OR p_slots < 100 OR p_slots > 100000 THEN
    RAISE EXCEPTION 'Choose between 100 and 100,000 extra member slots';
  END IF;
  INSERT INTO public.space_requests (tenant_id, requested_by, extra_slots, amount_cents, reference)
  VALUES (p_tenant, auth.uid(), p_slots, coalesce(p_amount, 0), nullif(btrim(coalesce(p_reference,'')),''))
  RETURNING id INTO v_id;
  PERFORM public.log_audit(p_tenant, 'space.requested', v_id::text,
    jsonb_build_object('slots', p_slots), null, auth.uid());
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;
REVOKE ALL ON FUNCTION public.request_extra_space(uuid, integer, text, bigint) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.request_extra_space(uuid, integer, text, bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.apply_space_purchase(p_reference text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row record;
BEGIN
  SELECT * INTO v_row FROM public.space_requests
   WHERE reference = p_reference AND status = 'pending' FOR UPDATE;
  IF v_row IS NULL THEN RETURN; END IF;
  UPDATE public.space_requests SET status = 'paid', applied_at = now() WHERE id = v_row.id;
  UPDATE public.tenants SET extra_member_slots = coalesce(extra_member_slots, 0) + v_row.extra_slots
   WHERE id = v_row.tenant_id;
  PERFORM public.log_audit(v_row.tenant_id, 'space.granted', v_row.id::text,
    jsonb_build_object('slots', v_row.extra_slots), null, null);
END; $$;
REVOKE ALL ON FUNCTION public.apply_space_purchase(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_space_purchase(text) TO service_role;

CREATE OR REPLACE FUNCTION public.platform_grant_space(p_tenant uuid, p_slots integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF p_slots IS NULL OR p_slots < 0 OR p_slots > 500000 THEN RAISE EXCEPTION 'Invalid slot count'; END IF;
  UPDATE public.tenants SET extra_member_slots = p_slots WHERE id = p_tenant;
  INSERT INTO public.platform_audit_events (actor_user_id, action, tenant_id, detail)
  VALUES (auth.uid(), 'space.granted', p_tenant, jsonb_build_object('slots', p_slots));
END; $$;
REVOKE ALL ON FUNCTION public.platform_grant_space(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_grant_space(uuid, integer) TO authenticated;

-- ============================================================
-- 10. Service delete (all packages, administrators only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.delete_service(p_service uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_count integer;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.services WHERE id = p_service;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF NOT public.is_tenant_admin(v_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  SELECT count(*) INTO v_count FROM public.attendance WHERE service_id = p_service;
  DELETE FROM public.attendance WHERE service_id = p_service;
  DELETE FROM public.services WHERE id = p_service;
  PERFORM public.log_audit(v_tenant, 'service.deleted', p_service::text,
    jsonb_build_object('attendance_removed', v_count), null, auth.uid());
END; $$;
REVOKE ALL ON FUNCTION public.delete_service(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.delete_service(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.rename_service(p_service uuid, p_name text, p_date date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.services WHERE id = p_service;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF NOT public.is_tenant_admin(v_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF length(btrim(coalesce(p_name,''))) < 2 OR length(p_name) > 80 THEN RAISE EXCEPTION 'Invalid service name'; END IF;
  UPDATE public.services SET name = btrim(p_name), service_date = coalesce(p_date, service_date)
   WHERE id = p_service;
  PERFORM public.log_audit(v_tenant, 'service.updated', p_service::text, '{}'::jsonb, null, auth.uid());
END; $$;
REVOKE ALL ON FUNCTION public.rename_service(uuid, text, date) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rename_service(uuid, text, date) TO authenticated;

-- ============================================================
-- 11. Self check-in v3 (education level + inviting leader)
-- ============================================================
CREATE OR REPLACE FUNCTION public.self_checkin_v3(
  p_subdomain text, p_service uuid, p_full_name text, p_phone text, p_email text,
  p_dob date, p_gender public.gender_type, p_marital_status text,
  p_area text, p_occupation text, p_education text, p_leader uuid, p_ip text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant record; v_branch uuid; v_member uuid; v_service record;
  v_phone text; v_token text; v_existing boolean := false;
  v_channel text; v_dest text; v_email text; v_leader uuid;
BEGIN
  SELECT * INTO v_tenant FROM public.tenants
   WHERE subdomain = lower(btrim(coalesce(p_subdomain,'')));
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Church not found'; END IF;
  IF v_tenant.status NOT IN ('active','grace') THEN
    RAISE EXCEPTION 'This church is not accepting check-ins right now';
  END IF;
  IF NOT public.check_rate_limit('self_checkin_ip', coalesce(p_ip,'unknown'), 10, 600) THEN
    RAISE EXCEPTION 'Too many check-ins from this device. Please wait a few minutes.';
  END IF;
  IF NOT public.check_rate_limit('self_checkin_tenant', v_tenant.id::text, 400, 3600) THEN
    RAISE EXCEPTION 'Check-in is temporarily unavailable. Please ask an usher for help.';
  END IF;
  IF length(btrim(coalesce(p_full_name,''))) < 2 OR length(p_full_name) > 120 THEN
    RAISE EXCEPTION 'Please enter your full name';
  END IF;
  IF p_marital_status IS NOT NULL AND p_marital_status NOT IN
     ('single','married','divorced','widowed','separated','prefer_not_to_say') THEN
    RAISE EXCEPTION 'Please select a valid marital status';
  END IF;
  IF length(coalesce(p_occupation,'')) > 120 OR length(coalesce(p_area,'')) > 120
     OR length(coalesce(p_education,'')) > 60 THEN
    RAISE EXCEPTION 'A member detail is too long';
  END IF;
  v_email := nullif(btrim(coalesce(p_email,'')),'');
  IF v_email IS NOT NULL AND (length(v_email) > 160 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
    RAISE EXCEPTION 'Please enter a valid email address';
  END IF;
  SELECT s.* INTO v_service FROM public.services s
   WHERE s.id = p_service AND s.tenant_id = v_tenant.id AND s.is_open;
  IF v_service IS NULL THEN RAISE EXCEPTION 'Please select an open service'; END IF;

  v_phone := public.normalize_phone_gh(p_phone);
  IF v_phone IS NULL OR length(v_phone) < 10 THEN RAISE EXCEPTION 'Please enter a valid phone number'; END IF;

  IF p_leader IS NOT NULL THEN
    SELECT id INTO v_leader FROM public.leader_profiles
     WHERE id = p_leader AND tenant_id = v_tenant.id AND status = 'active';
  END IF;

  SELECT id INTO v_branch FROM public.branches
   WHERE tenant_id = v_tenant.id
     AND (v_service.branch_id IS NULL OR id = v_service.branch_id)
   ORDER BY is_default DESC, created_at LIMIT 1;

  SELECT id INTO v_member FROM public.members
   WHERE tenant_id = v_tenant.id AND phone = v_phone LIMIT 1;

  IF v_member IS NULL THEN
    IF (SELECT count(*) FROM public.members WHERE tenant_id = v_tenant.id)
       >= public.tenant_limit(v_tenant.id, 'member_limit') THEN
      RAISE EXCEPTION 'This church has reached its member limit. Please ask an usher for help.';
    END IF;
    INSERT INTO public.members (
      tenant_id, branch_id, full_name, phone, email, date_of_birth, gender,
      marital_status, residential_area, occupation, education_level, invited_by_leader_id, status
    ) VALUES (
      v_tenant.id, v_branch, btrim(p_full_name), v_phone, v_email,
      p_dob, p_gender, p_marital_status, nullif(btrim(coalesce(p_area,'')),''),
      nullif(btrim(coalesce(p_occupation,'')),''), nullif(btrim(coalesce(p_education,'')),''),
      v_leader, 'first_timer'
    ) RETURNING id INTO v_member;
  ELSE
    v_existing := true;
    UPDATE public.members SET
      full_name = btrim(p_full_name),
      email = coalesce(v_email, email),
      date_of_birth = coalesce(p_dob, date_of_birth),
      gender = coalesce(p_gender, gender),
      marital_status = coalesce(p_marital_status, marital_status),
      residential_area = coalesce(nullif(btrim(coalesce(p_area,'')),''), residential_area),
      occupation = coalesce(nullif(btrim(coalesce(p_occupation,'')),''), occupation),
      education_level = coalesce(nullif(btrim(coalesce(p_education,'')),''), education_level),
      invited_by_leader_id = coalesce(v_leader, invited_by_leader_id)
    WHERE id = v_member;
  END IF;

  UPDATE public.qr_tokens SET revoked_at = now() WHERE member_id = v_member AND revoked_at IS NULL;
  v_token := encode(gen_random_bytes(16), 'hex');
  INSERT INTO public.qr_tokens (token_hash, tenant_id, member_id)
  VALUES (digest(v_token, 'sha256'), v_tenant.id, v_member);

  INSERT INTO public.attendance (tenant_id, service_id, member_id, branch_id, method)
  VALUES (v_tenant.id, v_service.id, v_member, coalesce(v_branch, v_service.branch_id), 'self_checkin')
  ON CONFLICT (service_id, member_id) DO NOTHING;

  IF NOT v_existing THEN
    v_channel := CASE
      WHEN v_email IS NOT NULL AND public.tenant_has_feature(v_tenant.id,'email') THEN 'email'
      WHEN public.tenant_has_feature(v_tenant.id,'sms') THEN 'sms' ELSE NULL END;
    IF v_channel IS NOT NULL THEN
      v_dest := CASE WHEN v_channel = 'email' THEN v_email ELSE v_phone END;
      PERFORM public.enqueue_message(v_tenant.id, v_channel, v_member, v_dest,
        'Welcome to ' || v_tenant.name,
        'Welcome to ' || v_tenant.name || ', ' || split_part(btrim(p_full_name),' ',1) ||
        '! Your member code is ' || v_token ||
        '. Keep your QR code safe and show it when you arrive next time.',
        'welcome', 'welcome:' || v_member::text);
    END IF;
  END IF;

  PERFORM public.log_audit(v_tenant.id, 'member.self_checkin', v_member::text,
    jsonb_build_object('returning', v_existing, 'service_id', v_service.id), p_ip, null);
  RETURN jsonb_build_object('ok', true, 'member_id', v_member, 'token', v_token,
    'returning', v_existing, 'checked_in', true, 'church', v_tenant.name,
    'service', v_service.name);
END; $$;
REVOKE ALL ON FUNCTION public.self_checkin_v3(text,uuid,text,text,text,date,public.gender_type,text,text,text,text,uuid,text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_checkin_v3(text,uuid,text,text,text,date,public.gender_type,text,text,text,text,uuid,text)
  TO service_role;

-- ============================================================
-- 12. Scale: indexes on the paths that grow fastest
-- ============================================================
CREATE INDEX IF NOT EXISTS attendance_tenant_recorded_idx ON public.attendance (tenant_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS attendance_service_idx ON public.attendance (service_id);
CREATE INDEX IF NOT EXISTS members_tenant_status_idx ON public.members (tenant_id, status);
CREATE INDEX IF NOT EXISTS members_tenant_created_idx ON public.members (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS services_tenant_date_idx ON public.services (tenant_id, service_date DESC);
CREATE INDEX IF NOT EXISTS messages_tenant_status_idx ON public.messages (tenant_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS audit_events_tenant_idx ON public.audit_events (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS rate_limit_hits_bucket_idx ON public.rate_limit_hits (bucket, identifier, created_at DESC);
CREATE INDEX IF NOT EXISTS tenant_users_user_idx ON public.tenant_users (user_id, status);

COMMENT ON FUNCTION public.self_checkin_v2(text,uuid,text,text,text,date,public.gender_type,text,text,text,text)
  IS 'DEPRECATED: replaced by public.self_checkin_v3 (adds education level and inviting leader).';
