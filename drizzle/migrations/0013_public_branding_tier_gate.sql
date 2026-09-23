CREATE OR REPLACE FUNCTION public.tenant_branding(p_subdomain text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE t record;
BEGIN
  SELECT id,name,subdomain,tier,logo_path,background_path,brand_primary,brand_accent,welcome_message,submit_button_text,status,group_vocabulary
  INTO t FROM public.tenants WHERE subdomain=lower(trim(coalesce(p_subdomain,'')));
  IF t IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_build_object(
    'id',t.id,'name',t.name,'subdomain',t.subdomain,'tier',t.tier,
    'logo_path',t.logo_path,'background_path',t.background_path,
    'brand_primary',t.brand_primary,'brand_accent',t.brand_accent,
    'welcome_message',t.welcome_message,'submit_button_text',t.submit_button_text,
    'active',t.status IN ('active','grace')
  );
END; $$;
REVOKE ALL ON FUNCTION public.tenant_branding(text) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tenant_branding(text) TO service_role;