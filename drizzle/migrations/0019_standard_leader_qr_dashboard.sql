
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
CREATE TABLE IF NOT EXISTS private.qr_key (id int PRIMARY KEY DEFAULT 1 CHECK (id = 1), k text NOT NULL);
INSERT INTO private.qr_key (k) VALUES (encode(gen_random_bytes(32), 'hex')) ON CONFLICT DO NOTHING;
REVOKE ALL ON private.qr_key FROM PUBLIC, anon, authenticated;

ALTER TABLE public.qr_tokens ADD COLUMN IF NOT EXISTS token_enc bytea;
ALTER TABLE public.qr_tokens ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'member';
ALTER TABLE public.attendance ADD COLUMN IF NOT EXISTS designation text NOT NULL DEFAULT 'member';
ALTER TABLE public.members ADD COLUMN IF NOT EXISTS is_leader boolean NOT NULL DEFAULT false;
ALTER TABLE public.leader_profiles ADD COLUMN IF NOT EXISTS member_id uuid REFERENCES public.members(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS qr_tokens_member_active_idx ON public.qr_tokens(member_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS members_invited_leader_idx ON public.members(invited_by_leader_id);

CREATE TABLE public.leader_contact_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.members(id) ON DELETE CASCADE,
  leader_id uuid NOT NULL REFERENCES public.leader_profiles(id) ON DELETE CASCADE,
  outcome text NOT NULL CHECK (outcome IN ('called','visited','messaged','unreachable','other')),
  note text CHECK (length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.leader_contact_logs TO authenticated;
GRANT ALL ON public.leader_contact_logs TO service_role;
ALTER TABLE public.leader_contact_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read contact logs" ON public.leader_contact_logs FOR SELECT TO authenticated
  USING (public.has_tenant_role(tenant_id, ARRAY['owner','church_admin','branch_admin']::public.app_role[]));
CREATE POLICY "leader reads own logs" ON public.leader_contact_logs FOR SELECT TO authenticated
  USING (leader_id IN (SELECT id FROM public.leader_profiles WHERE user_id = auth.uid()));
CREATE INDEX leader_contact_logs_member_idx ON public.leader_contact_logs(member_id, created_at DESC);

-- Issue a fresh QR token for a member, stored hashed (lookup) and encrypted (re-display).
CREATE OR REPLACE FUNCTION private.new_qr(p_tenant uuid, p_member uuid, p_kind text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_token text; v_key text;
BEGIN
  SELECT k INTO v_key FROM private.qr_key WHERE id = 1;
  UPDATE public.qr_tokens SET revoked_at = now() WHERE member_id = p_member AND revoked_at IS NULL;
  v_token := encode(gen_random_bytes(16), 'hex');
  INSERT INTO public.qr_tokens (token_hash, tenant_id, member_id, token_enc, kind)
  VALUES (digest(v_token, 'sha256'), p_tenant, p_member, pgp_sym_encrypt(v_token, v_key), p_kind);
  RETURN v_token;
END $$;
REVOKE ALL ON FUNCTION private.new_qr(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION private.current_qr(p_tenant uuid, p_member uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_enc bytea; v_key text; v_kind text;
BEGIN
  SELECT token_enc INTO v_enc FROM public.qr_tokens
   WHERE member_id = p_member AND revoked_at IS NULL AND token_enc IS NOT NULL
   ORDER BY issued_at DESC LIMIT 1;
  IF v_enc IS NOT NULL THEN
    SELECT k INTO v_key FROM private.qr_key WHERE id = 1;
    RETURN pgp_sym_decrypt(v_enc, v_key);
  END IF;
  SELECT CASE WHEN is_leader THEN 'leader' ELSE 'member' END INTO v_kind FROM public.members WHERE id = p_member;
  RETURN private.new_qr(p_tenant, p_member, coalesce(v_kind, 'member'));
END $$;
REVOKE ALL ON FUNCTION private.current_qr(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.issue_qr_token(p_member uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
declare v_tenant uuid; v_branch uuid; v_leader boolean;
begin
  select tenant_id, branch_id, is_leader into v_tenant, v_branch, v_leader from public.members where id = p_member;
  if v_tenant is null then raise exception 'Member not found'; end if;
  if not (public.is_tenant_admin(v_tenant)
     or (public.has_tenant_role(v_tenant, array['branch_admin']::public.app_role[])
         and v_branch is not distinct from public.user_branch(v_tenant))) then
    raise exception 'Not permitted';
  end if;
  if not public.check_rate_limit('issue_qr', auth.uid()::text, 300, 3600) then
    raise exception 'Rate limit exceeded';
  end if;
  perform public.log_audit(v_tenant, 'qr.issued', p_member::text);
  return private.new_qr(v_tenant, p_member, case when v_leader then 'leader' else 'member' end);
end $$;

-- View (not rotate) a member's current code.
CREATE OR REPLACE FUNCTION public.get_member_qr(p_member uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
declare v_m record;
begin
  select id, tenant_id, branch_id, full_name, is_leader into v_m from public.members where id = p_member;
  if v_m.id is null then raise exception 'Member not found'; end if;
  if not (public.is_tenant_admin(v_m.tenant_id)
     or (public.has_tenant_role(v_m.tenant_id, array['branch_admin']::public.app_role[])
         and v_m.branch_id is not distinct from public.user_branch(v_m.tenant_id))) then
    raise exception 'Not permitted';
  end if;
  if not public.check_rate_limit('view_qr', auth.uid()::text, 600, 3600) then raise exception 'Rate limit exceeded'; end if;
  perform public.log_audit(v_m.tenant_id, 'qr.viewed', p_member::text);
  return jsonb_build_object('token', private.current_qr(v_m.tenant_id, p_member), 'full_name', v_m.full_name,
    'kind', case when v_m.is_leader then 'leader' else 'member' end);
end $$;

CREATE OR REPLACE FUNCTION public.get_all_member_qrs(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
declare v_out jsonb;
begin
  if not public.is_tenant_admin(p_tenant) then raise exception 'Not permitted'; end if;
  if not public.check_rate_limit('all_qr_zip', auth.uid()::text, 3, 3600) then
    raise exception 'Download limit reached (3 per hour). Please try again later.';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'full_name', m.full_name,
      'kind', case when m.is_leader then 'leader' else 'member' end,
      'token', private.current_qr(p_tenant, m.id)) order by m.full_name), '[]'::jsonb)
    into v_out
    from (select id, full_name, is_leader from public.members
           where tenant_id = p_tenant and status in ('active','first_timer') order by full_name limit 5000) m;
  perform public.log_audit(p_tenant, 'qr.bulk_download', 'all', jsonb_build_object('count', jsonb_array_length(v_out)));
  return v_out;
end $$;

-- Scans record the designation carried by the code.
CREATE OR REPLACE FUNCTION public.resolve_scan(p_token text, p_service uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare v_tenant uuid; v_member uuid; v_name text; v_branch uuid; v_pos uuid; v_svc record; v_new boolean; v_kind text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.check_rate_limit('scan', auth.uid()::text, 600, 3600) then raise exception 'Rate limit exceeded'; end if;
  select * into v_svc from public.services where id = p_service;
  if v_svc is null then raise exception 'Service not found'; end if;
  if not public.is_tenant_member(v_svc.tenant_id) then raise exception 'Not permitted'; end if;
  if not public.tenant_can_write(v_svc.tenant_id) then raise exception 'Subscription inactive'; end if;
  if not v_svc.is_open then raise exception 'Service is closed'; end if;
  select q.tenant_id, q.member_id, q.kind into v_tenant, v_member, v_kind
  from public.qr_tokens q
  where q.token_hash = digest(coalesce(p_token,''), 'sha256') and q.revoked_at is null and q.tenant_id = v_svc.tenant_id;
  if v_member is null then return jsonb_build_object('ok', false, 'reason', 'unknown_code'); end if;
  select full_name, branch_id, position_id into v_name, v_branch, v_pos from public.members where id = v_member;
  if not public.can_read_member(v_tenant, v_branch, v_pos)
     and not public.has_tenant_role(v_tenant, array['usher']::public.app_role[]) then
    return jsonb_build_object('ok', false, 'reason', 'out_of_scope');
  end if;
  insert into public.attendance (tenant_id, service_id, member_id, branch_id, position_id, scanned_by_user_id, method, designation)
  values (v_tenant, p_service, v_member, coalesce(v_branch, v_svc.branch_id), v_pos, auth.uid(), 'scan', coalesce(v_kind,'member'))
  on conflict (service_id, member_id) do nothing;
  v_new := found;
  return jsonb_build_object('ok', true, 'member_name', v_name, 'duplicate', not v_new, 'designation', coalesce(v_kind,'member'));
end; $function$;

-- Self check-in now stores the code encrypted so the church can re-open it.
CREATE OR REPLACE FUNCTION public.self_checkin_v3(p_subdomain text, p_service uuid, p_full_name text, p_phone text, p_email text, p_dob date, p_gender gender_type, p_marital_status text, p_area text, p_occupation text, p_education text, p_leader uuid, p_ip text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'private' AS $function$
DECLARE
  v_tenant record; v_branch uuid; v_member uuid; v_service record;
  v_phone text; v_token text; v_existing boolean := false;
  v_channel text; v_dest text; v_email text; v_leader uuid; v_is_leader boolean := false;
BEGIN
  SELECT * INTO v_tenant FROM public.tenants WHERE subdomain = lower(btrim(coalesce(p_subdomain,'')));
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Church not found'; END IF;
  IF v_tenant.status NOT IN ('active','grace') THEN RAISE EXCEPTION 'This church is not accepting check-ins right now'; END IF;
  IF NOT public.check_rate_limit('self_checkin_ip', coalesce(p_ip,'unknown'), 10, 600) THEN
    RAISE EXCEPTION 'Too many check-ins from this device. Please wait a few minutes.';
  END IF;
  IF NOT public.check_rate_limit('self_checkin_tenant', v_tenant.id::text, 400, 3600) THEN
    RAISE EXCEPTION 'Check-in is temporarily unavailable. Please ask an usher for help.';
  END IF;
  IF length(btrim(coalesce(p_full_name,''))) < 2 OR length(p_full_name) > 120 THEN RAISE EXCEPTION 'Please enter your full name'; END IF;
  IF p_marital_status IS NOT NULL AND p_marital_status NOT IN ('single','married','divorced','widowed','separated','prefer_not_to_say') THEN
    RAISE EXCEPTION 'Please select a valid marital status';
  END IF;
  IF length(coalesce(p_occupation,'')) > 120 OR length(coalesce(p_area,'')) > 120 OR length(coalesce(p_education,'')) > 60 THEN
    RAISE EXCEPTION 'A member detail is too long';
  END IF;
  v_email := nullif(btrim(coalesce(p_email,'')),'');
  IF v_email IS NOT NULL AND (length(v_email) > 160 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN RAISE EXCEPTION 'Please enter a valid email address'; END IF;
  SELECT s.* INTO v_service FROM public.services s WHERE s.id = p_service AND s.tenant_id = v_tenant.id AND s.is_open;
  IF v_service IS NULL THEN RAISE EXCEPTION 'Please select an open service'; END IF;
  v_phone := public.normalize_phone_gh(p_phone);
  IF v_phone IS NULL OR length(v_phone) < 10 THEN RAISE EXCEPTION 'Please enter a valid phone number'; END IF;
  IF p_leader IS NOT NULL THEN
    IF NOT public.tenant_has_feature(v_tenant.id, 'leaders') THEN RAISE EXCEPTION 'Please choose Self / walk-in'; END IF;
    SELECT id INTO v_leader FROM public.leader_profiles WHERE id = p_leader AND tenant_id = v_tenant.id AND status = 'active';
    IF v_leader IS NULL THEN RAISE EXCEPTION 'Please choose a leader from the list'; END IF;
  END IF;
  SELECT id INTO v_branch FROM public.branches WHERE tenant_id = v_tenant.id AND (v_service.branch_id IS NULL OR id = v_service.branch_id)
   ORDER BY is_default DESC, created_at LIMIT 1;
  SELECT id, is_leader INTO v_member, v_is_leader FROM public.members WHERE tenant_id = v_tenant.id AND phone = v_phone LIMIT 1;
  IF v_member IS NULL THEN
    IF (SELECT count(*) FROM public.members WHERE tenant_id = v_tenant.id) >= public.tenant_limit(v_tenant.id, 'member_limit') THEN
      RAISE EXCEPTION 'This church has reached its member limit. Please ask an usher for help.';
    END IF;
    INSERT INTO public.members (tenant_id, branch_id, full_name, phone, email, date_of_birth, gender,
      marital_status, residential_area, occupation, education_level, invited_by_leader_id, status)
    VALUES (v_tenant.id, v_branch, btrim(p_full_name), v_phone, v_email, p_dob, p_gender, p_marital_status,
      nullif(btrim(coalesce(p_area,'')),''), nullif(btrim(coalesce(p_occupation,'')),''), nullif(btrim(coalesce(p_education,'')),''),
      v_leader, 'first_timer') RETURNING id INTO v_member;
    v_is_leader := false;
  ELSE
    v_existing := true;
    UPDATE public.members SET full_name = btrim(p_full_name), email = coalesce(v_email, email),
      date_of_birth = coalesce(p_dob, date_of_birth), gender = coalesce(p_gender, gender),
      marital_status = coalesce(p_marital_status, marital_status),
      residential_area = coalesce(nullif(btrim(coalesce(p_area,'')),''), residential_area),
      occupation = coalesce(nullif(btrim(coalesce(p_occupation,'')),''), occupation),
      education_level = coalesce(nullif(btrim(coalesce(p_education,'')),''), education_level),
      invited_by_leader_id = coalesce(v_leader, invited_by_leader_id)
    WHERE id = v_member;
  END IF;
  v_token := private.new_qr(v_tenant.id, v_member, CASE WHEN coalesce(v_is_leader,false) THEN 'leader' ELSE 'member' END);
  INSERT INTO public.attendance (tenant_id, service_id, member_id, branch_id, method, designation)
  VALUES (v_tenant.id, v_service.id, v_member, coalesce(v_branch, v_service.branch_id), 'self_checkin',
    CASE WHEN coalesce(v_is_leader,false) THEN 'leader' ELSE 'member' END)
  ON CONFLICT (service_id, member_id) DO NOTHING;
  IF NOT v_existing THEN
    v_channel := CASE WHEN v_email IS NOT NULL AND public.tenant_has_feature(v_tenant.id,'email') THEN 'email'
      WHEN public.tenant_has_feature(v_tenant.id,'sms') THEN 'sms' ELSE NULL END;
    IF v_channel IS NOT NULL THEN
      v_dest := CASE WHEN v_channel = 'email' THEN v_email ELSE v_phone END;
      PERFORM public.enqueue_message(v_tenant.id, v_channel, v_member, v_dest, 'Welcome to ' || v_tenant.name,
        'Welcome to ' || v_tenant.name || ', ' || split_part(btrim(p_full_name),' ',1) ||
        '! Your member code is ' || v_token || '. Keep your QR code safe and show it when you arrive next time.',
        'welcome', 'welcome:' || v_member::text);
    END IF;
  END IF;
  PERFORM public.log_audit(v_tenant.id, 'member.self_checkin', v_member::text,
    jsonb_build_object('returning', v_existing, 'service_id', v_service.id), p_ip, null);
  RETURN jsonb_build_object('ok', true, 'member_id', v_member, 'token', v_token, 'returning', v_existing,
    'checked_in', true, 'church', v_tenant.name, 'service', v_service.name,
    'kind', CASE WHEN coalesce(v_is_leader,false) THEN 'leader' ELSE 'member' END);
END; $function$;

-- Members a leader may see: chose them at check-in, or assigned via follow-ups.
CREATE OR REPLACE FUNCTION public.leader_scope_member_ids(p_leader uuid)
RETURNS SETOF uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id FROM public.members m WHERE m.invited_by_leader_id = p_leader AND m.status <> 'anonymised'
  UNION
  SELECT f.member_id FROM public.member_followups f WHERE f.assigned_leader_id = p_leader
$$;
REVOKE ALL ON FUNCTION public.leader_scope_member_ids(uuid) FROM PUBLIC, anon, authenticated;

-- Leader's own QR code (creates their linked member record the first time).
CREATE OR REPLACE FUNCTION public.leader_my_qr()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, private AS $$
DECLARE v_l record; v_member uuid; v_branch uuid;
BEGIN
  SELECT * INTO v_l FROM public.leader_profiles WHERE user_id = auth.uid() AND status = 'active' LIMIT 1;
  IF v_l.id IS NULL THEN RAISE EXCEPTION 'Not a leader'; END IF;
  IF NOT public.tenant_has_feature(v_l.tenant_id, 'leaders') THEN RAISE EXCEPTION 'Not part of this package'; END IF;
  v_member := v_l.member_id;
  IF v_member IS NULL AND v_l.phone IS NOT NULL THEN
    SELECT id INTO v_member FROM public.members WHERE tenant_id = v_l.tenant_id AND phone = v_l.phone LIMIT 1;
  END IF;
  IF v_member IS NULL THEN
    SELECT id INTO v_branch FROM public.branches WHERE tenant_id = v_l.tenant_id ORDER BY is_default DESC, created_at LIMIT 1;
    INSERT INTO public.members (tenant_id, branch_id, full_name, phone, email, date_of_birth, residential_area, status, is_leader)
    VALUES (v_l.tenant_id, v_branch, v_l.full_name, v_l.phone, v_l.email, v_l.date_of_birth, v_l.location, 'active', true)
    RETURNING id INTO v_member;
  END IF;
  UPDATE public.members SET is_leader = true, status = CASE WHEN status = 'first_timer' THEN 'active'::member_status ELSE status END WHERE id = v_member;
  IF v_l.member_id IS DISTINCT FROM v_member THEN
    UPDATE public.leader_profiles SET member_id = v_member WHERE id = v_l.id;
    UPDATE public.qr_tokens SET revoked_at = now() WHERE member_id = v_member AND revoked_at IS NULL AND kind <> 'leader';
  END IF;
  RETURN jsonb_build_object('token', private.current_qr(v_l.tenant_id, v_member), 'full_name', v_l.full_name);
END $$;
GRANT EXECUTE ON FUNCTION public.leader_my_qr() TO authenticated;

CREATE OR REPLACE FUNCTION public.leader_dashboard()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_l record; v_n int; v_sundays uuid[]; v_last uuid; v_first date; v_res jsonb;
BEGIN
  SELECT lp.*, t.name AS church_name, t.absence_threshold INTO v_l
    FROM public.leader_profiles lp JOIN public.tenants t ON t.id = lp.tenant_id
   WHERE lp.user_id = auth.uid() AND lp.status = 'active' LIMIT 1;
  IF v_l.id IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;
  IF NOT public.tenant_has_feature(v_l.tenant_id, 'leaders') THEN RETURN jsonb_build_object('ok', false); END IF;
  v_n := greatest(coalesce(v_l.absence_threshold, 3), 1);
  SELECT array_agg(id ORDER BY service_date DESC), min(service_date) INTO v_sundays, v_first FROM (
    SELECT id, service_date FROM public.services WHERE tenant_id = v_l.tenant_id AND extract(dow FROM service_date) = 0 AND service_date <= current_date
    ORDER BY service_date DESC LIMIT v_n) s;
  v_last := v_sundays[1];

  CREATE TEMP TABLE IF NOT EXISTS _scope (id uuid PRIMARY KEY) ON COMMIT DROP;
  DELETE FROM _scope;
  INSERT INTO _scope SELECT DISTINCT x FROM public.leader_scope_member_ids(v_l.id) x;

  WITH m AS (SELECT mm.* FROM public.members mm JOIN _scope s ON s.id = mm.id),
  last_seen AS (SELECT a.member_id, max(a.recorded_at) AS at FROM public.attendance a JOIN _scope s ON s.id = a.member_id GROUP BY a.member_id),
  fu AS (SELECT DISTINCT ON (member_id) member_id, status FROM public.member_followups WHERE tenant_id = v_l.tenant_id ORDER BY member_id, updated_at DESC),
  lastlog AS (SELECT DISTINCT ON (member_id) member_id, outcome, note, created_at FROM public.leader_contact_logs WHERE leader_id = v_l.id ORDER BY member_id, created_at DESC)
  SELECT jsonb_build_object(
    'ok', true, 'church', v_l.church_name, 'full_name', v_l.full_name, 'absence_threshold', v_n,
    'sundays_counted', coalesce(array_length(v_sundays, 1), 0),
    'stats', jsonb_build_object(
      'members', (SELECT count(*) FROM m),
      'first_timers_month', (SELECT count(*) FROM m WHERE status = 'first_timer' AND joined_on >= date_trunc('month', current_date)),
      'present_last_sunday', CASE WHEN v_last IS NULL THEN 0 ELSE (SELECT count(*) FROM public.attendance a JOIN _scope s ON s.id = a.member_id WHERE a.service_id = v_last) END,
      'absent', CASE WHEN coalesce(array_length(v_sundays,1),0) < v_n THEN 0 ELSE (SELECT count(*) FROM m WHERE m.joined_on <= v_first AND NOT EXISTS (SELECT 1 FROM public.attendance a WHERE a.member_id = m.id AND a.service_id = ANY(v_sundays))) END
    ),
    'members', coalesce((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'full_name', m.full_name, 'phone', m.phone, 'email', m.email,
        'status', m.status, 'joined_on', m.joined_on, 'last_seen', ls.at, 'residential_area', m.residential_area) ORDER BY m.full_name)
      FROM (SELECT * FROM m ORDER BY full_name LIMIT 1000) m LEFT JOIN last_seen ls ON ls.member_id = m.id), '[]'::jsonb),
    'first_timers', coalesce((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'full_name', m.full_name, 'phone', m.phone, 'joined_on', m.joined_on,
        'followup_status', fu.status) ORDER BY m.joined_on DESC)
      FROM (SELECT * FROM m WHERE status = 'first_timer' ORDER BY joined_on DESC LIMIT 200) m LEFT JOIN fu ON fu.member_id = m.id), '[]'::jsonb),
    'absentees', CASE WHEN coalesce(array_length(v_sundays,1),0) < v_n THEN '[]'::jsonb ELSE coalesce((SELECT jsonb_agg(jsonb_build_object('id', m.id, 'full_name', m.full_name, 'phone', m.phone,
        'last_seen', ls.at, 'last_outcome', ll.outcome, 'last_note', ll.note, 'last_contact', ll.created_at) ORDER BY ls.at NULLS FIRST)
      FROM m LEFT JOIN last_seen ls ON ls.member_id = m.id LEFT JOIN lastlog ll ON ll.member_id = m.id
      WHERE m.joined_on <= v_first AND NOT EXISTS (SELECT 1 FROM public.attendance a WHERE a.member_id = m.id AND a.service_id = ANY(v_sundays))), '[]'::jsonb) END,
    'demographics', jsonb_build_object(
      'gender', coalesce((SELECT jsonb_object_agg(k, c) FROM (SELECT coalesce(gender::text,'unknown') k, count(*) c FROM m GROUP BY 1) g), '{}'::jsonb),
      'marital', coalesce((SELECT jsonb_object_agg(k, c) FROM (SELECT coalesce(marital_status,'unknown') k, count(*) c FROM m GROUP BY 1) g), '{}'::jsonb),
      'age', coalesce((SELECT jsonb_object_agg(k, c) FROM (SELECT CASE WHEN date_of_birth IS NULL THEN 'unknown'
            WHEN age(date_of_birth) < interval '18 years' THEN 'Under 18' WHEN age(date_of_birth) < interval '26 years' THEN '18–25'
            WHEN age(date_of_birth) < interval '36 years' THEN '26–35' WHEN age(date_of_birth) < interval '51 years' THEN '36–50' ELSE '51+' END k, count(*) c FROM m GROUP BY 1) g), '{}'::jsonb),
      'location', coalesce((SELECT jsonb_object_agg(k, c) FROM (SELECT coalesce(residential_area,'unknown') k, count(*) c FROM m GROUP BY 1 ORDER BY 2 DESC LIMIT 8) g), '{}'::jsonb),
      'occupation', coalesce((SELECT jsonb_object_agg(k, c) FROM (SELECT coalesce(occupation,'unknown') k, count(*) c FROM m GROUP BY 1 ORDER BY 2 DESC LIMIT 8) g), '{}'::jsonb)
    ),
    'birthdays', coalesce((SELECT jsonb_agg(jsonb_build_object('id', b.id, 'full_name', b.full_name, 'date_of_birth', b.date_of_birth, 'phone', b.phone) ORDER BY b.nd)
      FROM (SELECT id, full_name, date_of_birth, phone,
              ((make_date(extract(year FROM current_date)::int, extract(month FROM date_of_birth)::int, least(extract(day FROM date_of_birth)::int, 28)) - current_date + 365) % 365) nd
            FROM m WHERE date_of_birth IS NOT NULL) b WHERE b.nd <= 30), '[]'::jsonb),
    'my_streak', (SELECT count(*) FROM (SELECT s.id FROM public.services s WHERE s.tenant_id = v_l.tenant_id AND extract(dow FROM s.service_date) = 0 AND s.service_date <= current_date ORDER BY s.service_date DESC LIMIT 12) s
                  WHERE v_l.member_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.attendance a WHERE a.service_id = s.id AND a.member_id = v_l.member_id))
  ) INTO v_res;
  RETURN v_res;
END $$;
GRANT EXECUTE ON FUNCTION public.leader_dashboard() TO authenticated;

CREATE OR REPLACE FUNCTION public.leader_log_contact(p_member uuid, p_outcome text, p_note text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_l record;
BEGIN
  SELECT * INTO v_l FROM public.leader_profiles WHERE user_id = auth.uid() AND status = 'active' LIMIT 1;
  IF v_l.id IS NULL THEN RAISE EXCEPTION 'Not a leader'; END IF;
  IF p_outcome NOT IN ('called','visited','messaged','unreachable','other') THEN RAISE EXCEPTION 'Invalid outcome'; END IF;
  IF length(coalesce(p_note,'')) > 500 THEN RAISE EXCEPTION 'Note is too long'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.leader_scope_member_ids(v_l.id) x WHERE x = p_member) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF NOT public.check_rate_limit('leader_contact', auth.uid()::text, 200, 3600) THEN RAISE EXCEPTION 'Rate limit exceeded'; END IF;
  INSERT INTO public.leader_contact_logs (tenant_id, member_id, leader_id, outcome, note)
  VALUES (v_l.tenant_id, p_member, v_l.id, p_outcome, nullif(btrim(coalesce(p_note,'')),''));
  UPDATE public.member_followups SET
    note = left(v_l.full_name || ' (' || p_outcome || ', ' || to_char(now(),'YYYY-MM-DD') || ')' || coalesce(': ' || nullif(btrim(p_note),''), ''), 500),
    status = CASE WHEN status = 'new' AND p_outcome IN ('called','visited','messaged') THEN 'contacted' ELSE status END,
    updated_at = now()
  WHERE member_id = p_member AND tenant_id = v_l.tenant_id;
  PERFORM public.log_audit(v_l.tenant_id, 'leader.contact_logged', p_member::text, jsonb_build_object('outcome', p_outcome), '', auth.uid());
END $$;
GRANT EXECUTE ON FUNCTION public.leader_log_contact(uuid, text, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.leader_dashboard(), public.leader_my_qr(), public.leader_log_contact(uuid,text,text), public.get_all_member_qrs(uuid), public.get_member_qr(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_member_qr(uuid), public.get_all_member_qrs(uuid) TO authenticated;
