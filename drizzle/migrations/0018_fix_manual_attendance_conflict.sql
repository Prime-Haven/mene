CREATE OR REPLACE FUNCTION public.set_manual_attendance(p_service uuid, p_members uuid[], p_present boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_svc public.services; v_n integer := 0;
BEGIN
  IF p_members IS NULL OR array_length(p_members, 1) IS NULL THEN RETURN jsonb_build_object('changed', 0); END IF;
  IF array_length(p_members, 1) > 500 THEN RAISE EXCEPTION 'Too many members at once'; END IF;
  SELECT * INTO v_svc FROM public.services WHERE id = p_service;
  IF v_svc.id IS NULL THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF NOT public.has_tenant_role(v_svc.tenant_id, ARRAY['owner','church_admin','branch_admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Not permitted'; END IF;
  IF NOT v_svc.is_open THEN RAISE EXCEPTION 'This service is closed'; END IF;
  IF NOT public.tenant_can_write(v_svc.tenant_id) THEN RAISE EXCEPTION 'Subscription inactive'; END IF;
  IF NOT public.check_rate_limit('manual_attendance', auth.uid()::text, 600, 60) THEN RAISE EXCEPTION 'Too many changes, slow down'; END IF;
  IF p_present THEN
    INSERT INTO public.attendance (tenant_id, service_id, member_id, branch_id, position_id, scanned_by_user_id, method)
    SELECT m.tenant_id, p_service, m.id, coalesce(m.branch_id, v_svc.branch_id), m.position_id, auth.uid(), 'manual'
    FROM public.members m WHERE m.id = ANY(p_members) AND m.tenant_id = v_svc.tenant_id AND m.status IN ('active','first_timer')
    ON CONFLICT (service_id, member_id) WHERE member_id IS NOT NULL DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    DELETE FROM public.attendance a WHERE a.service_id = p_service AND a.tenant_id = v_svc.tenant_id AND a.member_id = ANY(p_members);
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  PERFORM public.log_audit(v_svc.tenant_id, CASE WHEN p_present THEN 'attendance.manual_mark' ELSE 'attendance.manual_unmark' END,
    p_service::text, jsonb_build_object('count', v_n), NULL, auth.uid());
  RETURN jsonb_build_object('changed', v_n);
END $function$;