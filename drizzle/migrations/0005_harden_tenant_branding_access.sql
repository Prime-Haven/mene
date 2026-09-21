REVOKE UPDATE ON public.tenants FROM authenticated;

CREATE OR REPLACE FUNCTION public.update_tenant_vocabulary(p_tenant uuid, p_vocabulary text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_tenant_admin(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF length(trim(coalesce(p_vocabulary,''))) < 2 OR length(p_vocabulary) > 40 THEN
    RAISE EXCEPTION 'Invalid group name';
  END IF;
  UPDATE public.tenants SET group_vocabulary = trim(p_vocabulary) WHERE id = p_tenant;
END; $$;
REVOKE ALL ON FUNCTION public.update_tenant_vocabulary(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_tenant_vocabulary(uuid,text) TO authenticated;

DROP POLICY IF EXISTS "public reads tenant branding" ON storage.objects;
DROP POLICY IF EXISTS "tenant admins upload branding" ON storage.objects;
DROP POLICY IF EXISTS "tenant admins update branding" ON storage.objects;
CREATE POLICY "tenant admins upload branding" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'tenant-branding'
  AND public.is_tenant_admin(((storage.foldername(name))[1])::uuid)
  AND lower(storage.extension(name)) IN ('png','jpg','jpeg','webp')
  AND coalesce((metadata->>'mimetype')::text, '') IN ('image/png','image/jpeg','image/webp')
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
  AND lower(storage.extension(name)) IN ('png','jpg','jpeg','webp')
  AND coalesce((metadata->>'mimetype')::text, '') IN ('image/png','image/jpeg','image/webp')
);