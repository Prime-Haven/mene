ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS require_mfa boolean NOT NULL DEFAULT false;

CREATE TABLE public.member_followups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','visited','joined','not_interested')),
  assigned_leader_id uuid REFERENCES public.leader_profiles(id) ON DELETE SET NULL,
  note text CHECK (note IS NULL OR char_length(note) <= 1000),
  next_contact_on date,
  source text NOT NULL DEFAULT 'first_timer' CHECK (source IN ('first_timer','absence','manual')),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (member_id)
);
CREATE INDEX member_followups_tenant_status_idx ON public.member_followups (tenant_id, status, next_contact_on);
CREATE INDEX member_followups_leader_idx ON public.member_followups (assigned_leader_id);
GRANT SELECT ON public.member_followups TO authenticated;
GRANT ALL ON public.member_followups TO service_role;
ALTER TABLE public.member_followups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "church admins read followups" ON public.member_followups FOR SELECT TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner','church_admin','branch_admin']::public.app_role[]));
CREATE POLICY "assigned leader reads followups" ON public.member_followups FOR SELECT TO authenticated
  USING (assigned_leader_id IN (SELECT lp.id FROM public.leader_profiles lp WHERE lp.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.tier_entitlements(p_tier tenant_tier)
 RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT CASE p_tier
    WHEN 'basic' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', false, 'ask_mene', true,
      'structure', false, 'groups', false, 'branches', false,
      'leaders', false, 'space_addon', false, 'followups', false,
      'email', true, 'sms', false, 'broadcasts', false, 'automations', false,
      'audit', true, 'staff_seats', 3, 'member_limit', 500, 'daily_messages', 200)
    WHEN 'standard' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', true, 'ask_mene', true,
      'structure', true, 'groups', true, 'branches', false,
      'leaders', true, 'space_addon', true, 'followups', true,
      'email', true, 'sms', false, 'broadcasts', true, 'automations', true,
      'audit', true, 'staff_seats', 10, 'member_limit', 3000, 'daily_messages', 1000)
    ELSE jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', true, 'ask_mene', true,
      'structure', true, 'groups', true, 'branches', true,
      'leaders', true, 'space_addon', true, 'followups', true,
      'email', true, 'sms', true, 'broadcasts', true, 'automations', true,
      'audit', true, 'staff_seats', 40, 'member_limit', 25000, 'daily_messages', 5000)
  END
$function$;

-- Attendance register ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attendance_register(p_service uuid, p_search text DEFAULT NULL)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_svc public.services; v_q text;
BEGIN
  SELECT * INTO v_svc FROM public.services WHERE id = p_service;
  IF v_svc.id IS NULL THEN RAISE EXCEPTION 'Service not found'; END IF;
  IF NOT public.has_tenant_role(v_svc.tenant_id, ARRAY['owner','church_admin','branch_admin']::public.app_role[]) THEN
    RAISE EXCEPTION 'Not permitted'; END IF;
  v_q := nullif(trim(left(coalesce(p_search,''), 80)), '');
  RETURN jsonb_build_object(
    'service', jsonb_build_object('id', v_svc.id, 'name', v_svc.name, 'date', v_svc.service_date, 'is_open', v_svc.is_open),
    'writable', v_svc.is_open AND public.tenant_can_write(v_svc.tenant_id),
    'present_count', (SELECT count(*) FROM public.attendance a WHERE a.service_id = p_service AND a.member_id IS NOT NULL),
    'members', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', m.id, 'full_name', m.full_name, 'status', m.status, 'present', a.id IS NOT NULL, 'method', a.method) ORDER BY m.full_name)
      FROM (SELECT * FROM public.members m0
            WHERE m0.tenant_id = v_svc.tenant_id AND m0.status IN ('active','first_timer')
              AND (v_q IS NULL OR m0.full_name ILIKE '%' || v_q || '%')
            ORDER BY m0.full_name LIMIT 500) m
      LEFT JOIN public.attendance a ON a.service_id = p_service AND a.member_id = m.id), '[]'::jsonb)
  );
END $$;

CREATE OR REPLACE FUNCTION public.set_manual_attendance(p_service uuid, p_members uuid[], p_present boolean)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
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
    ON CONFLICT (service_id, member_id) DO NOTHING;
    GET DIAGNOSTICS v_n = ROW_COUNT;
  ELSE
    DELETE FROM public.attendance a WHERE a.service_id = p_service AND a.tenant_id = v_svc.tenant_id AND a.member_id = ANY(p_members);
    GET DIAGNOSTICS v_n = ROW_COUNT;
  END IF;
  PERFORM public.log_audit(v_svc.tenant_id, CASE WHEN p_present THEN 'attendance.manual_mark' ELSE 'attendance.manual_unmark' END,
    p_service::text, jsonb_build_object('count', v_n), NULL, auth.uid());
  RETURN jsonb_build_object('changed', v_n);
END $$;

-- Absence alerts ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.absent_members(p_tenant uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_n integer; v_dates date[];
BEGIN
  IF NOT public.has_tenant_role(p_tenant, ARRAY['owner','church_admin','branch_admin']::public.app_role[]) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  SELECT greatest(1, least(coalesce(absence_threshold, 3), 12)) INTO v_n FROM public.tenants WHERE id = p_tenant;
  SELECT array_agg(d ORDER BY d DESC) INTO v_dates FROM (
    SELECT DISTINCT service_date d FROM public.services
    WHERE tenant_id = p_tenant AND extract(dow FROM service_date) = 0 AND service_date <= current_date
    ORDER BY d DESC LIMIT v_n) s;
  IF v_dates IS NULL OR array_length(v_dates, 1) < v_n THEN
    RETURN jsonb_build_object('threshold', v_n, 'ready', false, 'members', '[]'::jsonb);
  END IF;
  RETURN jsonb_build_object('threshold', v_n, 'ready', true, 'members', coalesce((
    SELECT jsonb_agg(jsonb_build_object('id', m.id, 'full_name', m.full_name, 'phone', m.phone, 'last_seen', ls.last_seen, 'in_followups', f.id IS NOT NULL) ORDER BY ls.last_seen NULLS FIRST, m.full_name)
    FROM (SELECT * FROM public.members m0 WHERE m0.tenant_id = p_tenant AND m0.status IN ('active','first_timer')
            AND m0.joined_on <= v_dates[array_length(v_dates,1)]
            AND NOT EXISTS (SELECT 1 FROM public.attendance a JOIN public.services s ON s.id = a.service_id
                            WHERE a.member_id = m0.id AND s.tenant_id = p_tenant AND s.service_date = ANY(v_dates))
          ORDER BY m0.full_name LIMIT 100) m
    LEFT JOIN LATERAL (SELECT max(a.recorded_at) last_seen FROM public.attendance a WHERE a.member_id = m.id) ls ON true
    LEFT JOIN public.member_followups f ON f.member_id = m.id), '[]'::jsonb));
END $$;

-- Follow-ups ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_followup(p_member uuid, p_status text, p_leader uuid, p_note text, p_next date, p_source text DEFAULT 'manual')
 RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_tenant uuid; v_tier public.tenant_tier; v_id uuid;
BEGIN
  SELECT m.tenant_id, t.tier INTO v_tenant, v_tier FROM public.members m JOIN public.tenants t ON t.id = m.tenant_id WHERE m.id = p_member;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF NOT public.has_tenant_role(v_tenant, ARRAY['owner','church_admin','branch_admin']::public.app_role[]) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF NOT (public.tier_entitlements(v_tier)->>'followups')::boolean THEN RAISE EXCEPTION 'Follow-ups need the Standard or Premium package'; END IF;
  IF NOT public.tenant_can_write(v_tenant) THEN RAISE EXCEPTION 'Subscription inactive'; END IF;
  IF p_status NOT IN ('new','contacted','visited','joined','not_interested') THEN RAISE EXCEPTION 'Invalid status'; END IF;
  IF p_source NOT IN ('first_timer','absence','manual') THEN RAISE EXCEPTION 'Invalid source'; END IF;
  IF p_leader IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.leader_profiles WHERE id = p_leader AND tenant_id = v_tenant) THEN RAISE EXCEPTION 'Leader not found'; END IF;
  IF p_note IS NOT NULL AND char_length(p_note) > 1000 THEN RAISE EXCEPTION 'Note is too long'; END IF;
  INSERT INTO public.member_followups (tenant_id, member_id, status, assigned_leader_id, note, next_contact_on, source, created_by)
  VALUES (v_tenant, p_member, p_status, p_leader, nullif(trim(p_note), ''), p_next, p_source, auth.uid())
  ON CONFLICT (member_id) DO UPDATE SET status = excluded.status, assigned_leader_id = excluded.assigned_leader_id,
    note = excluded.note, next_contact_on = excluded.next_contact_on, updated_at = now()
  RETURNING id INTO v_id;
  IF p_status = 'joined' THEN UPDATE public.members SET status = 'active' WHERE id = p_member AND status = 'first_timer'; END IF;
  PERFORM public.log_audit(v_tenant, 'followup.updated', p_member::text, jsonb_build_object('status', p_status), NULL, auth.uid());
  RETURN v_id;
END $$;

CREATE OR REPLACE FUNCTION public.list_followups(p_tenant uuid)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_tenant_role(p_tenant, ARRAY['owner','church_admin','branch_admin']::public.app_role[]) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object('member_id', m.id, 'full_name', m.full_name, 'phone', m.phone, 'joined_on', m.joined_on,
      'followup_id', f.id, 'status', coalesce(f.status, 'new'), 'assigned_leader_id', f.assigned_leader_id,
      'leader_name', lp.full_name, 'note', f.note, 'next_contact_on', f.next_contact_on, 'source', coalesce(f.source, 'first_timer'))
      ORDER BY (f.next_contact_on IS NULL), f.next_contact_on, m.joined_on DESC)
    FROM (SELECT * FROM public.members WHERE tenant_id = p_tenant AND status IN ('first_timer','active')) m
    LEFT JOIN public.member_followups f ON f.member_id = m.id
    LEFT JOIN public.leader_profiles lp ON lp.id = f.assigned_leader_id
    WHERE f.id IS NOT NULL OR m.status = 'first_timer'
    LIMIT 1000), '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.my_followups()
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('member_id', m.id, 'full_name', m.full_name, 'phone', m.phone,
    'status', f.status, 'note', f.note, 'next_contact_on', f.next_contact_on) ORDER BY f.next_contact_on NULLS LAST), '[]'::jsonb)
  FROM public.member_followups f
  JOIN public.leader_profiles lp ON lp.id = f.assigned_leader_id AND lp.user_id = auth.uid()
  JOIN public.members m ON m.id = f.member_id
  WHERE f.status NOT IN ('joined','not_interested');
$$;

-- Two-step sign-in ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_require_mfa(p_tenant uuid, p_required boolean)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_tenant_role(p_tenant, ARRAY['owner']::public.app_role[]) THEN RAISE EXCEPTION 'Only the owner can change this'; END IF;
  IF p_required AND coalesce(auth.jwt()->>'aal','aal1') <> 'aal2' THEN RAISE EXCEPTION 'Turn on two-step sign-in for your own account first'; END IF;
  UPDATE public.tenants SET require_mfa = p_required WHERE id = p_tenant;
  PERFORM public.log_audit(p_tenant, 'security.require_mfa', NULL, jsonb_build_object('required', p_required), NULL, auth.uid());
END $$;

-- Account-level operator check (no assurance level) used only to decide whether to show 2FA setup.
CREATE OR REPLACE FUNCTION public.is_platform_admin_account()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid()) $$;

REVOKE EXECUTE ON FUNCTION public.attendance_register(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_manual_attendance(uuid, uuid[], boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.absent_members(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.upsert_followup(uuid, text, uuid, text, date, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.list_followups(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_followups() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.set_require_mfa(uuid, boolean) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin_account() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attendance_register(uuid, text), public.set_manual_attendance(uuid, uuid[], boolean),
  public.absent_members(uuid), public.upsert_followup(uuid, text, uuid, text, date, text), public.list_followups(uuid),
  public.my_followups(), public.set_require_mfa(uuid, boolean), public.is_platform_admin_account() TO authenticated;