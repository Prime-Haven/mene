CREATE OR REPLACE FUNCTION public.update_tenant_branding(
  p_tenant uuid, p_name text, p_primary text, p_accent text,
  p_welcome text, p_button text, p_logo_path text, p_background_path text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_logo text := nullif(trim(coalesce(p_logo_path,'')),''); v_background text := nullif(trim(coalesce(p_background_path,'')),'');
BEGIN
  IF NOT public.is_tenant_admin(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF p_primary !~ '^#[0-9A-Fa-f]{6}$' OR p_accent !~ '^#[0-9A-Fa-f]{6}$' THEN RAISE EXCEPTION 'Invalid brand colour'; END IF;
  IF length(trim(coalesce(p_name,''))) < 2 OR length(p_name) > 120 THEN RAISE EXCEPTION 'Invalid church name'; END IF;
  IF length(coalesce(p_welcome,'')) > 240 OR length(coalesce(p_button,'')) > 40 THEN RAISE EXCEPTION 'Brand text is too long'; END IF;
  IF v_logo IS NOT NULL AND v_logo NOT LIKE p_tenant::text || '/%' THEN RAISE EXCEPTION 'Invalid logo path'; END IF;
  IF v_background IS NOT NULL AND v_background NOT LIKE p_tenant::text || '/%' THEN RAISE EXCEPTION 'Invalid background path'; END IF;
  UPDATE public.tenants SET name = trim(p_name), brand_primary = lower(p_primary), brand_accent = lower(p_accent),
    welcome_message = nullif(trim(coalesce(p_welcome,'')),''), submit_button_text = coalesce(nullif(trim(coalesce(p_button,'')),''),'Check in'),
    logo_path = v_logo, background_path = v_background WHERE id = p_tenant;
  PERFORM public.log_audit(p_tenant, 'branding.updated', p_tenant::text, '{}'::jsonb, null, auth.uid());
END; $$;

CREATE OR REPLACE FUNCTION public.create_member(
  p_tenant uuid, p_branch uuid, p_full_name text, p_phone text, p_email text,
  p_dob date, p_gender public.gender_type, p_marital_status text, p_area text, p_occupation text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_phone text;
BEGIN
  IF NOT public.has_tenant_role(p_tenant, ARRAY['owner','church_admin','branch_admin']::public.app_role[]) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF p_branch IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.branches WHERE id=p_branch AND tenant_id=p_tenant) THEN RAISE EXCEPTION 'Invalid branch'; END IF;
  IF length(trim(coalesce(p_full_name,''))) < 2 OR length(p_full_name) > 120 THEN RAISE EXCEPTION 'Invalid full name'; END IF;
  IF p_marital_status IS NOT NULL AND p_marital_status NOT IN ('single','married','divorced','widowed','separated','prefer_not_to_say') THEN RAISE EXCEPTION 'Invalid marital status'; END IF;
  v_phone := CASE WHEN nullif(trim(coalesce(p_phone,'')),'') IS NULL THEN NULL ELSE public.normalize_phone_gh(p_phone) END;
  INSERT INTO public.members(tenant_id,branch_id,full_name,phone,email,date_of_birth,gender,marital_status,residential_area,occupation)
  VALUES(p_tenant,p_branch,trim(p_full_name),v_phone,nullif(trim(coalesce(p_email,'')),''),p_dob,p_gender,p_marital_status,nullif(trim(coalesce(p_area,'')),''),nullif(trim(coalesce(p_occupation,'')),''))
  RETURNING id INTO v_id;
  PERFORM public.log_audit(p_tenant,'member.created',v_id::text,'{}'::jsonb,null,auth.uid());
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.create_member(uuid,uuid,text,text,text,date,public.gender_type,text,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_member(uuid,uuid,text,text,text,date,public.gender_type,text,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.anonymise_member(p_member uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.members WHERE id = p_member;
  IF v_tenant IS NULL OR NOT public.is_tenant_admin(v_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  UPDATE public.members SET full_name='Anonymised member', phone=NULL, email=NULL, date_of_birth=NULL,
    gender=NULL, marital_status=NULL, residential_area=NULL, occupation=NULL, position_id=NULL, status='anonymised'
  WHERE id=p_member;
  UPDATE public.qr_tokens SET revoked_at=now() WHERE member_id=p_member AND revoked_at IS NULL;
  PERFORM public.log_audit(v_tenant,'member.anonymised',p_member::text,'{}'::jsonb,null,auth.uid());
END; $$;