CREATE OR REPLACE FUNCTION public.is_platform_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
     and exists (select 1 from public.platform_admins where user_id = auth.uid());
$function$;