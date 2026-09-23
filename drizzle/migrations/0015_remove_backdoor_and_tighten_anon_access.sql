DROP FUNCTION IF EXISTS public.verify_super_admin_credentials(text, text);
DROP FUNCTION IF EXISTS public.set_super_admin_password(text, text);
REVOKE ALL ON public.super_admin_credentials FROM anon, authenticated;
COMMENT ON TABLE public.super_admin_credentials IS 'DEPRECATED: legacy master-password login removed; operator access uses platform_admins only.';
REVOKE EXECUTE ON FUNCTION public.apply_space_purchase(text) FROM PUBLIC, anon, authenticated;
COMMENT ON FUNCTION public.apply_space_purchase(text) IS 'DEPRECATED: use apply_space_purchase(text, bigint).';
REVOKE EXECUTE ON FUNCTION public.log_audit(uuid,text,text,jsonb,text,uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text,text,integer,integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;