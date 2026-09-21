ALTER TABLE public.members
  ADD COLUMN marital_status text,
  ADD COLUMN occupation text;

ALTER TABLE public.tenants
  ADD COLUMN brand_primary text NOT NULL DEFAULT '#3b82f6',
  ADD COLUMN brand_accent text NOT NULL DEFAULT '#0f172a',
  ADD COLUMN welcome_message text,
  ADD COLUMN submit_button_text text NOT NULL DEFAULT 'Check in',
  ADD COLUMN background_path text;

CREATE OR REPLACE FUNCTION public.tenant_branding(p_subdomain text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record;
BEGIN
  SELECT id, name, subdomain, logo_path, background_path, brand_primary, brand_accent,
         welcome_message, submit_button_text, status, group_vocabulary
    INTO t FROM public.tenants WHERE subdomain = lower(trim(coalesce(p_subdomain,'')));
  IF t IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id', t.id, 'name', t.name, 'subdomain', t.subdomain,
    'logo_path', t.logo_path, 'background_path', t.background_path,
    'brand_primary', t.brand_primary, 'brand_accent', t.brand_accent,
    'welcome_message', t.welcome_message, 'submit_button_text', t.submit_button_text,
    'active', t.status IN ('active','grace')
  );
END; $$;
REVOKE ALL ON FUNCTION public.tenant_branding(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_branding(text) TO service_role;

CREATE OR REPLACE FUNCTION public.public_open_services(p_subdomain text)
RETURNS TABLE(id uuid, name text, service_date date)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.id, s.name, s.service_date
  FROM public.services s
  JOIN public.tenants t ON t.id = s.tenant_id
  WHERE t.subdomain = lower(trim(coalesce(p_subdomain,'')))
    AND t.status IN ('active','grace')
    AND s.is_open
  ORDER BY s.service_date DESC, s.created_at DESC
  LIMIT 30
$$;
REVOKE ALL ON FUNCTION public.public_open_services(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_open_services(text) TO service_role;

CREATE OR REPLACE FUNCTION public.self_checkin_v2(
  p_subdomain text, p_service uuid, p_full_name text, p_phone text, p_email text,
  p_dob date, p_gender public.gender_type, p_marital_status text,
  p_area text, p_occupation text, p_ip text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant record; v_branch uuid; v_member uuid; v_service record;
  v_phone text; v_token text; v_existing boolean := false;
BEGIN
  SELECT * INTO v_tenant FROM public.tenants
   WHERE subdomain = lower(trim(coalesce(p_subdomain,'')));
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
  IF length(trim(coalesce(p_full_name,''))) < 2 THEN RAISE EXCEPTION 'Please enter your full name'; END IF;
  IF p_marital_status IS NOT NULL AND p_marital_status NOT IN ('single','married','divorced','widowed','separated','prefer_not_to_say') THEN
    RAISE EXCEPTION 'Please select a valid marital status';
  END IF;
  IF length(coalesce(p_occupation,'')) > 120 OR length(coalesce(p_area,'')) > 120 THEN
    RAISE EXCEPTION 'A member detail is too long';
  END IF;
  SELECT s.* INTO v_service FROM public.services s
   WHERE s.id = p_service AND s.tenant_id = v_tenant.id AND s.is_open;
  IF v_service IS NULL THEN RAISE EXCEPTION 'Please select an open service'; END IF;
  v_phone := public.normalize_phone_gh(p_phone);
  IF v_phone IS NULL OR length(v_phone) < 10 THEN RAISE EXCEPTION 'Please enter a valid phone number'; END IF;
  SELECT id INTO v_branch FROM public.branches
   WHERE tenant_id = v_tenant.id ORDER BY is_default DESC, created_at LIMIT 1;
  SELECT id INTO v_member FROM public.members
   WHERE tenant_id = v_tenant.id AND phone = v_phone LIMIT 1;
  IF v_member IS NULL THEN
    INSERT INTO public.members (
      tenant_id, branch_id, full_name, phone, email, date_of_birth, gender,
      marital_status, residential_area, occupation, status
    ) VALUES (
      v_tenant.id, v_branch, trim(p_full_name), v_phone, nullif(trim(coalesce(p_email,'')),''),
      p_dob, p_gender, p_marital_status, nullif(trim(coalesce(p_area,'')),''),
      nullif(trim(coalesce(p_occupation,'')),''), 'first_timer'
    ) RETURNING id INTO v_member;
  ELSE
    v_existing := true;
    UPDATE public.members SET
      full_name = trim(p_full_name),
      email = coalesce(nullif(trim(coalesce(p_email,'')),''), email),
      date_of_birth = coalesce(p_dob, date_of_birth),
      gender = coalesce(p_gender, gender),
      marital_status = coalesce(p_marital_status, marital_status),
      residential_area = coalesce(nullif(trim(coalesce(p_area,'')),''), residential_area),
      occupation = coalesce(nullif(trim(coalesce(p_occupation,'')),''), occupation)
    WHERE id = v_member;
  END IF;
  UPDATE public.qr_tokens SET revoked_at = now() WHERE member_id = v_member AND revoked_at IS NULL;
  v_token := encode(gen_random_bytes(16), 'hex');
  INSERT INTO public.qr_tokens (token_hash, tenant_id, member_id)
  VALUES (digest(v_token, 'sha256'), v_tenant.id, v_member);
  INSERT INTO public.attendance (tenant_id, service_id, member_id, branch_id, method)
  VALUES (v_tenant.id, v_service.id, v_member, v_branch, 'self_checkin')
  ON CONFLICT (service_id, member_id) DO NOTHING;
  PERFORM public.log_audit(v_tenant.id, 'member.self_checkin', v_member::text,
    jsonb_build_object('returning', v_existing, 'service_id', v_service.id), p_ip, null);
  RETURN jsonb_build_object('ok', true, 'member_id', v_member, 'token', v_token,
    'returning', v_existing, 'checked_in', true, 'church', v_tenant.name,
    'service', v_service.name);
END; $$;
REVOKE ALL ON FUNCTION public.self_checkin_v2(text,uuid,text,text,text,date,public.gender_type,text,text,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_checkin_v2(text,uuid,text,text,text,date,public.gender_type,text,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.update_tenant_branding(
  p_tenant uuid, p_name text, p_primary text, p_accent text,
  p_welcome text, p_button text, p_logo_path text, p_background_path text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_tenant_admin(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF p_primary !~ '^#[0-9A-Fa-f]{6}$' OR p_accent !~ '^#[0-9A-Fa-f]{6}$' THEN
    RAISE EXCEPTION 'Invalid brand colour';
  END IF;
  IF length(trim(coalesce(p_name,''))) < 2 OR length(p_name) > 120 THEN RAISE EXCEPTION 'Invalid church name'; END IF;
  IF length(coalesce(p_welcome,'')) > 240 OR length(coalesce(p_button,'')) > 40 THEN RAISE EXCEPTION 'Brand text is too long'; END IF;
  IF p_logo_path IS NOT NULL AND p_logo_path NOT LIKE p_tenant::text || '/%' THEN RAISE EXCEPTION 'Invalid logo path'; END IF;
  IF p_background_path IS NOT NULL AND p_background_path NOT LIKE p_tenant::text || '/%' THEN RAISE EXCEPTION 'Invalid background path'; END IF;
  UPDATE public.tenants SET
    name = trim(p_name), brand_primary = lower(p_primary), brand_accent = lower(p_accent),
    welcome_message = nullif(trim(coalesce(p_welcome,'')),''),
    submit_button_text = coalesce(nullif(trim(coalesce(p_button,'')),''),'Check in'),
    logo_path = p_logo_path, background_path = p_background_path
  WHERE id = p_tenant;
  PERFORM public.log_audit(p_tenant, 'branding.updated', p_tenant::text, '{}'::jsonb, null, auth.uid());
END; $$;
REVOKE ALL ON FUNCTION public.update_tenant_branding(uuid,text,text,text,text,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_tenant_branding(uuid,text,text,text,text,text,text,text) TO authenticated;

CREATE POLICY "tenant admins upload branding" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'tenant-branding'
  AND public.is_tenant_admin(((storage.foldername(name))[1])::uuid)
);
CREATE POLICY "tenant admins update branding" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'tenant-branding'
  AND public.is_tenant_admin(((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'tenant-branding'
  AND public.is_tenant_admin(((storage.foldername(name))[1])::uuid)
);
CREATE POLICY "tenant admins delete branding" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'tenant-branding'
  AND public.is_tenant_admin(((storage.foldername(name))[1])::uuid)
);
CREATE POLICY "public reads tenant branding" ON storage.objects
FOR SELECT TO public
USING (bucket_id = 'tenant-branding');