-- ============================================================
-- 1. Package entitlements (single source of truth)
-- ============================================================
CREATE OR REPLACE FUNCTION public.tier_entitlements(p_tier public.tenant_tier)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE p_tier
    WHEN 'basic' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', false,
      'structure', false, 'groups', false, 'branches', false,
      'email', true, 'sms', false, 'broadcasts', false, 'automations', false,
      'audit', true, 'staff_seats', 3, 'member_limit', 500, 'daily_messages', 200)
    WHEN 'standard' THEN jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', true,
      'structure', true, 'groups', true, 'branches', false,
      'email', true, 'sms', false, 'broadcasts', true, 'automations', true,
      'audit', true, 'staff_seats', 10, 'member_limit', 3000, 'daily_messages', 1000)
    ELSE jsonb_build_object(
      'members', true, 'services', true, 'checkin', true, 'qr', true, 'branding', true,
      'reports_basic', true, 'reports_advanced', true,
      'structure', true, 'groups', true, 'branches', true,
      'email', true, 'sms', true, 'broadcasts', true, 'automations', true,
      'audit', true, 'staff_seats', 40, 'member_limit', 25000, 'daily_messages', 5000)
  END
$$;
REVOKE ALL ON FUNCTION public.tier_entitlements(public.tenant_tier) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tier_entitlements(public.tenant_tier) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tenant_features(_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tier public.tenant_tier;
BEGIN
  SELECT tier INTO v_tier FROM public.tenants WHERE id = _tenant;
  IF v_tier IS NULL THEN RETURN '{}'::jsonb; END IF;
  RETURN public.tier_entitlements(v_tier);
END; $$;
REVOKE ALL ON FUNCTION public.tenant_features(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tenant_features(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tenant_has_feature(_tenant uuid, _feature text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((public.tier_entitlements(t.tier) ->> _feature) = 'true', false)
  FROM public.tenants t WHERE t.id = _tenant
$$;
REVOKE ALL ON FUNCTION public.tenant_has_feature(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tenant_has_feature(uuid, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.tenant_limit(_tenant uuid, _key text)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((public.tier_entitlements(t.tier) ->> _key)::int, 0)
  FROM public.tenants t WHERE t.id = _tenant
$$;
REVOKE ALL ON FUNCTION public.tenant_limit(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tenant_limit(uuid, text) TO authenticated, service_role;

-- ============================================================
-- 2. Messaging columns
-- ============================================================
ALTER TABLE public.members
  ADD COLUMN messaging_opt_out boolean NOT NULL DEFAULT false;

ALTER TABLE public.tenants
  ADD COLUMN reply_to_email citext,
  ADD COLUMN sms_sender_id text,
  ADD COLUMN quiet_hour_start smallint NOT NULL DEFAULT 21,
  ADD COLUMN quiet_hour_end smallint NOT NULL DEFAULT 7,
  ADD COLUMN absence_threshold smallint NOT NULL DEFAULT 3;

-- ============================================================
-- 3. Broadcasts + message queue
-- ============================================================
CREATE TABLE public.broadcasts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  created_by uuid REFERENCES auth.users(id),
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  audience jsonb NOT NULL DEFAULT '{}'::jsonb,
  subject text,
  body text NOT NULL,
  recipient_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.broadcasts TO authenticated;
GRANT ALL ON public.broadcasts TO service_role;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant admins read broadcasts" ON public.broadcasts
  FOR SELECT TO authenticated USING (public.is_tenant_admin(tenant_id));

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  broadcast_id uuid REFERENCES public.broadcasts(id) ON DELETE SET NULL,
  member_id uuid REFERENCES public.members(id) ON DELETE SET NULL,
  channel text NOT NULL CHECK (channel IN ('email','sms')),
  recipient text NOT NULL,
  subject text,
  body text NOT NULL,
  trigger text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sending','sent','failed','skipped','cancelled')),
  provider_id text,
  error text,
  attempts smallint NOT NULL DEFAULT 0,
  dedupe_key text,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant admins read messages" ON public.messages
  FOR SELECT TO authenticated USING (public.is_tenant_admin(tenant_id));

CREATE UNIQUE INDEX messages_dedupe_idx
  ON public.messages (tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX messages_tenant_status_idx ON public.messages (tenant_id, status, created_at DESC);
CREATE INDEX messages_pending_idx ON public.messages (scheduled_at) WHERE status = 'queued';
CREATE INDEX broadcasts_tenant_idx ON public.broadcasts (tenant_id, created_at DESC);

-- ============================================================
-- 4. Scale: indexes for the queries that grow
-- ============================================================
CREATE INDEX IF NOT EXISTS attendance_tenant_recorded_idx
  ON public.attendance (tenant_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS attendance_member_idx
  ON public.attendance (member_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS attendance_branch_idx
  ON public.attendance (tenant_id, branch_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS members_tenant_name_idx
  ON public.members (tenant_id, full_name);
CREATE INDEX IF NOT EXISTS members_tenant_phone_idx
  ON public.members (tenant_id, phone);
CREATE INDEX IF NOT EXISTS members_tenant_status_idx
  ON public.members (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS members_tenant_position_idx
  ON public.members (tenant_id, position_id);
CREATE INDEX IF NOT EXISTS members_dob_idx
  ON public.members (tenant_id, date_of_birth);
CREATE INDEX IF NOT EXISTS services_tenant_date_idx
  ON public.services (tenant_id, service_date DESC);
CREATE INDEX IF NOT EXISTS audit_tenant_created_idx
  ON public.audit_events (tenant_id, created_at DESC);

-- ============================================================
-- 5. Usage counters against package limits
-- ============================================================
CREATE OR REPLACE FUNCTION public.tenant_usage(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_members int; v_staff int; v_today int; v_month int;
BEGIN
  IF NOT public.is_tenant_member(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  SELECT count(*) INTO v_members FROM public.members
   WHERE tenant_id = p_tenant AND status <> 'anonymised';
  SELECT count(*) INTO v_staff FROM public.tenant_users
   WHERE tenant_id = p_tenant AND status = 'active';
  SELECT count(*) INTO v_today FROM public.messages
   WHERE tenant_id = p_tenant AND created_at >= current_date;
  SELECT count(*) INTO v_month FROM public.messages
   WHERE tenant_id = p_tenant AND created_at >= date_trunc('month', now());
  RETURN jsonb_build_object(
    'members', v_members, 'staff', v_staff,
    'messages_today', v_today, 'messages_month', v_month,
    'features', public.tenant_features(p_tenant));
END; $$;
REVOKE ALL ON FUNCTION public.tenant_usage(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.tenant_usage(uuid) TO authenticated;

-- ============================================================
-- 6. Secure bulk member import (replaces direct table writes)
-- ============================================================
CREATE OR REPLACE FUNCTION public.import_members_batch(
  p_tenant uuid, p_branch uuid, p_filename text, p_rows jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r jsonb; v_batch uuid; v_phone text; v_branch uuid; v_limit int;
  v_total int := 0; v_inserted int := 0; v_skipped int := 0; v_existing uuid;
  v_name text; v_email text; v_dob date; v_gender public.gender_type; v_marital text;
BEGIN
  IF NOT (public.is_tenant_admin(p_tenant)
     OR public.has_tenant_role(p_tenant, ARRAY['branch_admin']::public.app_role[])) THEN
    RAISE EXCEPTION 'Not permitted';
  END IF;
  IF NOT public.tenant_can_write(p_tenant) THEN RAISE EXCEPTION 'Subscription inactive'; END IF;
  IF NOT public.check_rate_limit('import_members', auth.uid()::text, 20, 3600) THEN
    RAISE EXCEPTION 'Too many imports. Please try again later.';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'Invalid import data'; END IF;
  v_total := jsonb_array_length(p_rows);
  IF v_total = 0 THEN RAISE EXCEPTION 'The file has no rows'; END IF;
  IF v_total > 2000 THEN RAISE EXCEPTION 'Please import at most 2000 rows at a time'; END IF;

  v_limit := public.tenant_limit(p_tenant, 'member_limit');
  IF (SELECT count(*) FROM public.members WHERE tenant_id = p_tenant) + v_total > v_limit THEN
    RAISE EXCEPTION 'This import would exceed your package limit of % members', v_limit;
  END IF;

  IF public.tenant_has_feature(p_tenant, 'branches') AND p_branch IS NOT NULL THEN
    SELECT id INTO v_branch FROM public.branches WHERE id = p_branch AND tenant_id = p_tenant;
  END IF;
  IF v_branch IS NULL THEN
    SELECT id INTO v_branch FROM public.branches
     WHERE tenant_id = p_tenant ORDER BY is_default DESC, created_at LIMIT 1;
  END IF;

  INSERT INTO public.import_batches (tenant_id, created_by, filename, row_count)
  VALUES (p_tenant, auth.uid(), left(coalesce(p_filename,'upload'), 200), v_total)
  RETURNING id INTO v_batch;

  FOR r IN SELECT jsonb_array_elements(p_rows) LOOP
    v_name := nullif(btrim(coalesce(r->>'full_name','')), '');
    v_phone := public.normalize_phone_gh(r->>'phone');
    IF v_name IS NULL OR length(v_name) > 120 OR v_phone IS NULL OR length(v_phone) < 10 THEN
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;
    v_email := nullif(btrim(coalesce(r->>'email','')), '');
    IF v_email IS NOT NULL AND (length(v_email) > 160 OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') THEN
      v_email := NULL;
    END IF;
    BEGIN v_dob := nullif(r->>'date_of_birth','')::date; EXCEPTION WHEN others THEN v_dob := NULL; END;
    v_gender := CASE lower(coalesce(r->>'gender',''))
      WHEN 'male' THEN 'male'::public.gender_type
      WHEN 'female' THEN 'female'::public.gender_type
      WHEN 'other' THEN 'other'::public.gender_type ELSE NULL END;
    v_marital := CASE lower(coalesce(r->>'marital_status',''))
      WHEN 'single' THEN 'single' WHEN 'married' THEN 'married' WHEN 'divorced' THEN 'divorced'
      WHEN 'widowed' THEN 'widowed' WHEN 'separated' THEN 'separated' ELSE NULL END;

    SELECT id INTO v_existing FROM public.members
     WHERE tenant_id = p_tenant AND phone = v_phone LIMIT 1;
    IF v_existing IS NOT NULL THEN
      v_skipped := v_skipped + 1; CONTINUE;
    END IF;

    INSERT INTO public.members (
      tenant_id, branch_id, full_name, phone, email, date_of_birth, gender,
      marital_status, residential_area, occupation, status, import_batch_id
    ) VALUES (
      p_tenant, v_branch, v_name, v_phone, v_email, v_dob, v_gender, v_marital,
      left(nullif(btrim(coalesce(r->>'residential_area','')),''), 120),
      left(nullif(btrim(coalesce(r->>'occupation','')),''), 120),
      'active', v_batch
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  UPDATE public.import_batches
     SET inserted_count = v_inserted, skipped_count = v_skipped WHERE id = v_batch;
  PERFORM public.log_audit(p_tenant, 'members.imported', v_batch::text,
    jsonb_build_object('rows', v_total, 'inserted', v_inserted, 'skipped', v_skipped),
    null, auth.uid());
  RETURN jsonb_build_object('batch_id', v_batch, 'rows', v_total,
    'inserted', v_inserted, 'skipped', v_skipped);
END; $$;
REVOKE ALL ON FUNCTION public.import_members_batch(uuid,uuid,text,jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.import_members_batch(uuid,uuid,text,jsonb) TO authenticated;

-- ============================================================
-- 7. Auditable exports
-- ============================================================
CREATE OR REPLACE FUNCTION public.log_member_export(p_tenant uuid, p_count integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_tenant_member(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF NOT public.check_rate_limit('member_export', auth.uid()::text, 20, 3600) THEN
    RAISE EXCEPTION 'Too many exports. Please try again later.';
  END IF;
  PERFORM public.log_audit(p_tenant, 'members.exported', null,
    jsonb_build_object('rows', greatest(coalesce(p_count,0), 0)), null, auth.uid());
END; $$;
REVOKE ALL ON FUNCTION public.log_member_export(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.log_member_export(uuid, integer) TO authenticated;

-- ============================================================
-- 8. Message enqueueing
-- ============================================================
CREATE OR REPLACE FUNCTION public.enqueue_message(
  p_tenant uuid, p_channel text, p_member uuid, p_recipient text,
  p_subject text, p_body text, p_trigger text, p_dedupe text,
  p_broadcast uuid DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid; v_cap int; v_today int; v_opt boolean;
BEGIN
  IF p_channel NOT IN ('email','sms') THEN RAISE EXCEPTION 'Invalid channel'; END IF;
  IF NOT public.tenant_has_feature(p_tenant, p_channel) THEN RETURN NULL; END IF;
  IF nullif(btrim(coalesce(p_recipient,'')),'') IS NULL THEN RETURN NULL; END IF;
  IF length(coalesce(p_body,'')) = 0 THEN RETURN NULL; END IF;

  IF p_member IS NOT NULL THEN
    SELECT messaging_opt_out INTO v_opt FROM public.members
     WHERE id = p_member AND tenant_id = p_tenant;
    IF v_opt IS NULL OR v_opt THEN RETURN NULL; END IF;
  END IF;

  v_cap := public.tenant_limit(p_tenant, 'daily_messages');
  SELECT count(*) INTO v_today FROM public.messages
   WHERE tenant_id = p_tenant AND created_at >= current_date;
  IF v_today >= v_cap THEN RETURN NULL; END IF;

  INSERT INTO public.messages (
    tenant_id, broadcast_id, member_id, channel, recipient, subject, body, trigger, dedupe_key
  ) VALUES (
    p_tenant, p_broadcast, p_member, p_channel, btrim(p_recipient),
    left(nullif(btrim(coalesce(p_subject,'')),''), 200), left(p_body, 4000),
    coalesce(nullif(btrim(coalesce(p_trigger,'')),''),'manual'),
    nullif(btrim(coalesce(p_dedupe,'')),'')
  )
  ON CONFLICT (tenant_id, dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.enqueue_message(uuid,text,uuid,text,text,text,text,text,uuid)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_message(uuid,text,uuid,text,text,text,text,text,uuid)
  TO service_role;

-- ============================================================
-- 9. Audience resolution (drives broadcasts and reports)
-- ============================================================
CREATE OR REPLACE FUNCTION public.resolve_audience(
  p_tenant uuid, p_channel text, p_kind text, p_ref uuid
) RETURNS TABLE(member_id uuid, full_name text, recipient text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_threshold smallint;
BEGIN
  IF NOT public.is_tenant_member(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  SELECT absence_threshold INTO v_threshold FROM public.tenants WHERE id = p_tenant;

  RETURN QUERY
  SELECT m.id, m.full_name,
         CASE WHEN p_channel = 'email' THEN m.email::text ELSE m.phone END AS recipient
  FROM public.members m
  WHERE m.tenant_id = p_tenant
    AND m.status IN ('first_timer','active')
    AND NOT m.messaging_opt_out
    AND NOT m.is_minor
    AND public.can_read_member(m.tenant_id, m.branch_id, m.position_id)
    AND CASE WHEN p_channel = 'email' THEN m.email IS NOT NULL ELSE m.phone IS NOT NULL END
    AND CASE p_kind
      WHEN 'all' THEN true
      WHEN 'branch' THEN m.branch_id = p_ref
      WHEN 'group' THEN m.position_id = p_ref
      WHEN 'first_timers' THEN m.status = 'first_timer'
      WHEN 'birthdays_month' THEN extract(month from m.date_of_birth) = extract(month from now())
      WHEN 'absent' THEN NOT EXISTS (
        SELECT 1 FROM public.attendance a
        JOIN public.services s ON s.id = a.service_id
        WHERE a.member_id = m.id
          AND s.service_date >= current_date - (coalesce(v_threshold,3) * 7))
      ELSE false END
  ORDER BY m.full_name
  LIMIT 5000;
END; $$;
REVOKE ALL ON FUNCTION public.resolve_audience(uuid,text,text,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.resolve_audience(uuid,text,text,uuid) TO authenticated, service_role;

-- ============================================================
-- 10. Broadcast queueing (admins; dry run supported)
-- ============================================================
CREATE OR REPLACE FUNCTION public.queue_broadcast(
  p_tenant uuid, p_channel text, p_subject text, p_body text,
  p_kind text, p_ref uuid, p_dry_run boolean
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_broadcast uuid; v_row record; v_queued int := 0; v_total int := 0;
  v_cap int; v_today int;
BEGIN
  IF NOT public.is_tenant_admin(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF NOT public.tenant_can_write(p_tenant) THEN RAISE EXCEPTION 'Subscription inactive'; END IF;
  IF p_channel NOT IN ('email','sms') THEN RAISE EXCEPTION 'Invalid channel'; END IF;
  IF NOT public.tenant_has_feature(p_tenant, 'broadcasts') THEN
    RAISE EXCEPTION 'Broadcasts are not included in your package';
  END IF;
  IF NOT public.tenant_has_feature(p_tenant, p_channel) THEN
    RAISE EXCEPTION 'That channel is not included in your package';
  END IF;
  IF p_kind NOT IN ('all','branch','group','first_timers','absent','birthdays_month') THEN
    RAISE EXCEPTION 'Please choose a valid audience';
  END IF;
  IF p_kind IN ('branch','group') AND p_ref IS NULL THEN
    RAISE EXCEPTION 'Please choose which one to send to';
  END IF;
  IF p_kind = 'branch' AND NOT public.tenant_has_feature(p_tenant, 'branches') THEN
    RAISE EXCEPTION 'Branches are not included in your package';
  END IF;
  IF p_kind = 'group' AND NOT public.tenant_has_feature(p_tenant, 'groups') THEN
    RAISE EXCEPTION 'Groups are not included in your package';
  END IF;
  IF length(btrim(coalesce(p_body,''))) < 2 THEN RAISE EXCEPTION 'Please write a message'; END IF;
  IF length(p_body) > 1200 THEN RAISE EXCEPTION 'Please keep the message under 1200 characters'; END IF;
  IF p_channel = 'sms' AND length(p_body) > 480 THEN
    RAISE EXCEPTION 'Text messages must be under 480 characters';
  END IF;
  IF p_channel = 'email' AND length(btrim(coalesce(p_subject,''))) < 2 THEN
    RAISE EXCEPTION 'Please add a subject';
  END IF;
  IF NOT public.check_rate_limit('broadcast', p_tenant::text, 20, 3600) THEN
    RAISE EXCEPTION 'Too many sends in the last hour. Please try again later.';
  END IF;

  SELECT count(*) INTO v_total FROM public.resolve_audience(p_tenant, p_channel, p_kind, p_ref);

  IF p_dry_run THEN
    RETURN jsonb_build_object('dry_run', true, 'recipients', v_total, 'queued', 0);
  END IF;
  IF v_total = 0 THEN RAISE EXCEPTION 'Nobody in that audience has a usable contact detail'; END IF;

  v_cap := public.tenant_limit(p_tenant, 'daily_messages');
  SELECT count(*) INTO v_today FROM public.messages
   WHERE tenant_id = p_tenant AND created_at >= current_date;
  IF v_today + v_total > v_cap THEN
    RAISE EXCEPTION 'This send would pass your daily limit of % messages', v_cap;
  END IF;

  INSERT INTO public.broadcasts (tenant_id, created_by, channel, audience, subject, body, recipient_count)
  VALUES (p_tenant, auth.uid(), p_channel,
          jsonb_build_object('kind', p_kind, 'ref', p_ref),
          left(nullif(btrim(coalesce(p_subject,'')),''), 200), p_body, v_total)
  RETURNING id INTO v_broadcast;

  FOR v_row IN SELECT * FROM public.resolve_audience(p_tenant, p_channel, p_kind, p_ref) LOOP
    INSERT INTO public.messages (
      tenant_id, broadcast_id, member_id, channel, recipient, subject, body, trigger
    ) VALUES (
      p_tenant, v_broadcast, v_row.member_id, p_channel, v_row.recipient,
      left(nullif(btrim(coalesce(p_subject,'')),''), 200),
      replace(p_body, '{{name}}', split_part(v_row.full_name, ' ', 1)), 'broadcast'
    );
    v_queued := v_queued + 1;
  END LOOP;

  PERFORM public.log_audit(p_tenant, 'broadcast.queued', v_broadcast::text,
    jsonb_build_object('channel', p_channel, 'audience', p_kind, 'recipients', v_queued),
    null, auth.uid());
  RETURN jsonb_build_object('dry_run', false, 'broadcast_id', v_broadcast,
    'recipients', v_total, 'queued', v_queued);
END; $$;
REVOKE ALL ON FUNCTION public.queue_broadcast(uuid,text,text,text,text,uuid,boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.queue_broadcast(uuid,text,text,text,text,uuid,boolean) TO authenticated;

-- ============================================================
-- 11. Queue worker surface (service role only)
-- ============================================================
CREATE OR REPLACE FUNCTION public.claim_pending_messages(p_limit integer)
RETURNS TABLE(
  id uuid, tenant_id uuid, channel text, recipient text, subject text, body text,
  church_name text, reply_to text, sms_sender text, brand_primary text, logo_path text
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    UPDATE public.messages m SET status = 'sending', attempts = m.attempts + 1
    WHERE m.id IN (
      SELECT c.id FROM public.messages c
      JOIN public.tenants t ON t.id = c.tenant_id
      WHERE c.status = 'queued'
        AND c.scheduled_at <= now()
        AND c.attempts < 3
        AND t.status IN ('active','grace')
        AND NOT (
          CASE WHEN t.quiet_hour_start > t.quiet_hour_end
            THEN extract(hour from now()) >= t.quiet_hour_start
              OR extract(hour from now()) < t.quiet_hour_end
            ELSE extract(hour from now()) >= t.quiet_hour_start
             AND extract(hour from now()) < t.quiet_hour_end END)
      ORDER BY c.scheduled_at
      LIMIT greatest(least(coalesce(p_limit, 50), 200), 1)
      FOR UPDATE SKIP LOCKED)
    RETURNING m.*)
  SELECT c.id, c.tenant_id, c.channel, c.recipient, c.subject, c.body,
         t.name, t.reply_to_email::text, t.sms_sender_id, t.brand_primary, t.logo_path
  FROM claimed c JOIN public.tenants t ON t.id = c.tenant_id;
END; $$;
REVOKE ALL ON FUNCTION public.claim_pending_messages(integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_pending_messages(integer) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_message_result(
  p_id uuid, p_ok boolean, p_provider_id text, p_error text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_attempts smallint;
BEGIN
  SELECT attempts INTO v_attempts FROM public.messages WHERE id = p_id;
  IF v_attempts IS NULL THEN RETURN; END IF;
  IF p_ok THEN
    UPDATE public.messages SET status = 'sent', sent_at = now(),
      provider_id = left(coalesce(p_provider_id,''), 200), error = NULL
     WHERE id = p_id;
  ELSE
    UPDATE public.messages SET
      status = CASE WHEN v_attempts >= 3 THEN 'failed' ELSE 'queued' END,
      scheduled_at = now() + (v_attempts * interval '10 minutes'),
      error = left(coalesce(p_error,'Send failed'), 400)
     WHERE id = p_id;
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.mark_message_result(uuid,boolean,text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_message_result(uuid,boolean,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.record_delivery_event(
  p_provider_id text, p_event text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_msg record;
BEGIN
  SELECT * INTO v_msg FROM public.messages
   WHERE provider_id = p_provider_id ORDER BY created_at DESC LIMIT 1;
  IF v_msg IS NULL THEN RETURN; END IF;
  IF p_event IN ('bounced','complained','failed') THEN
    UPDATE public.messages SET status = 'failed', error = p_event WHERE id = v_msg.id;
    IF v_msg.member_id IS NOT NULL AND p_event IN ('bounced','complained') THEN
      UPDATE public.members SET messaging_opt_out = true WHERE id = v_msg.member_id;
    END IF;
    PERFORM public.log_audit(v_msg.tenant_id, 'message.' || p_event, v_msg.id::text,
      jsonb_build_object('channel', v_msg.channel));
  END IF;
END; $$;
REVOKE ALL ON FUNCTION public.record_delivery_event(text,text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_delivery_event(text,text) TO service_role;

-- ============================================================
-- 12. Automations: birthdays + absence follow-up
-- ============================================================
CREATE OR REPLACE FUNCTION public.run_daily_automations()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t record; m record; v_birthdays int := 0; v_absent int := 0; v_channel text; v_dest text;
BEGIN
  FOR t IN SELECT * FROM public.tenants WHERE status IN ('active','grace') LOOP
    IF NOT public.tenant_has_feature(t.id, 'automations') THEN CONTINUE; END IF;
    v_channel := CASE WHEN public.tenant_has_feature(t.id, 'sms') THEN 'sms' ELSE 'email' END;

    FOR m IN
      SELECT id, full_name, email, phone FROM public.members
      WHERE tenant_id = t.id AND status IN ('first_timer','active')
        AND NOT messaging_opt_out AND NOT is_minor AND date_of_birth IS NOT NULL
        AND extract(month from date_of_birth) = extract(month from current_date)
        AND extract(day from date_of_birth) = extract(day from current_date)
      LIMIT 500
    LOOP
      v_dest := CASE WHEN v_channel = 'sms' THEN m.phone ELSE m.email::text END;
      IF public.enqueue_message(t.id, v_channel, m.id, v_dest,
        'Happy birthday, ' || split_part(m.full_name,' ',1) || '!',
        'Happy birthday ' || split_part(m.full_name,' ',1) ||
        '! The whole family at ' || t.name || ' is celebrating with you today. God bless you.',
        'birthday', 'birthday:' || m.id::text || ':' || to_char(current_date,'YYYY')) IS NOT NULL
      THEN v_birthdays := v_birthdays + 1; END IF;
    END LOOP;

    IF extract(dow from current_date) = 2 THEN
      FOR m IN
        SELECT ra.member_id AS id, ra.full_name, ra.recipient
        FROM public.resolve_audience(t.id, v_channel, 'absent', NULL) ra
        LIMIT 300
      LOOP
        IF public.enqueue_message(t.id, v_channel, m.id, m.recipient,
          'We have missed you at ' || t.name,
          'Hello ' || split_part(m.full_name,' ',1) ||
          ', we have missed you at ' || t.name ||
          '. We would love to see you at our next service.',
          'absence', 'absence:' || m.id::text || ':' || to_char(current_date,'IYYY-IW')) IS NOT NULL
        THEN v_absent := v_absent + 1; END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('birthdays', v_birthdays, 'absence', v_absent);
END; $$;
REVOKE ALL ON FUNCTION public.run_daily_automations() FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.run_daily_automations() TO service_role;

-- ============================================================
-- 13. Welcome message on first check-in (extends self check-in)
-- ============================================================
CREATE OR REPLACE FUNCTION public.self_checkin_v2(
  p_subdomain text, p_service uuid, p_full_name text, p_phone text, p_email text,
  p_dob date, p_gender public.gender_type, p_marital_status text,
  p_area text, p_occupation text, p_ip text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_tenant record; v_branch uuid; v_member uuid; v_service record;
  v_phone text; v_token text; v_existing boolean := false;
  v_channel text; v_dest text; v_email text;
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
  IF length(trim(coalesce(p_full_name,''))) < 2 OR length(p_full_name) > 120 THEN
    RAISE EXCEPTION 'Please enter your full name';
  END IF;
  IF p_marital_status IS NOT NULL AND p_marital_status NOT IN
     ('single','married','divorced','widowed','separated','prefer_not_to_say') THEN
    RAISE EXCEPTION 'Please select a valid marital status';
  END IF;
  IF length(coalesce(p_occupation,'')) > 120 OR length(coalesce(p_area,'')) > 120 THEN
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
      marital_status, residential_area, occupation, status
    ) VALUES (
      v_tenant.id, v_branch, trim(p_full_name), v_phone, v_email,
      p_dob, p_gender, p_marital_status, nullif(trim(coalesce(p_area,'')),''),
      nullif(trim(coalesce(p_occupation,'')),''), 'first_timer'
    ) RETURNING id INTO v_member;
  ELSE
    v_existing := true;
    UPDATE public.members SET
      full_name = trim(p_full_name),
      email = coalesce(v_email, email),
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
        'Welcome to ' || v_tenant.name || ', ' || split_part(trim(p_full_name),' ',1) ||
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
REVOKE ALL ON FUNCTION public.self_checkin_v2(text,uuid,text,text,text,date,public.gender_type,text,text,text,text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.self_checkin_v2(text,uuid,text,text,text,date,public.gender_type,text,text,text,text)
  TO service_role;

-- ============================================================
-- 14. Package-aware guards on existing surfaces
-- ============================================================
CREATE OR REPLACE FUNCTION public.set_member_messaging(p_member uuid, p_opt_out boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant FROM public.members WHERE id = p_member;
  IF v_tenant IS NULL THEN RAISE EXCEPTION 'Member not found'; END IF;
  IF NOT public.is_tenant_admin(v_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  UPDATE public.members SET messaging_opt_out = coalesce(p_opt_out, false) WHERE id = p_member;
  PERFORM public.log_audit(v_tenant, 'member.messaging_changed', p_member::text,
    jsonb_build_object('opt_out', p_opt_out), null, auth.uid());
END; $$;
REVOKE ALL ON FUNCTION public.set_member_messaging(uuid, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.set_member_messaging(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_messaging_settings(
  p_tenant uuid, p_reply_to text, p_sms_sender text,
  p_quiet_start smallint, p_quiet_end smallint, p_absence smallint
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_tenant_admin(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF p_reply_to IS NOT NULL AND btrim(p_reply_to) <> ''
     AND btrim(p_reply_to) !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Please enter a valid reply-to email address';
  END IF;
  IF p_sms_sender IS NOT NULL AND btrim(p_sms_sender) <> ''
     AND btrim(p_sms_sender) !~ '^[A-Za-z0-9 ]{3,11}$' THEN
    RAISE EXCEPTION 'The text-message sender name must be 3-11 letters or numbers';
  END IF;
  IF coalesce(p_quiet_start,21) NOT BETWEEN 0 AND 23
     OR coalesce(p_quiet_end,7) NOT BETWEEN 0 AND 23 THEN
    RAISE EXCEPTION 'Quiet hours must be between 0 and 23';
  END IF;
  IF coalesce(p_absence,3) NOT BETWEEN 1 AND 12 THEN
    RAISE EXCEPTION 'Follow-up weeks must be between 1 and 12';
  END IF;
  UPDATE public.tenants SET
    reply_to_email = nullif(btrim(coalesce(p_reply_to,'')),'')::citext,
    sms_sender_id = nullif(btrim(coalesce(p_sms_sender,'')),''),
    quiet_hour_start = coalesce(p_quiet_start, 21),
    quiet_hour_end = coalesce(p_quiet_end, 7),
    absence_threshold = coalesce(p_absence, 3)
  WHERE id = p_tenant;
  PERFORM public.log_audit(p_tenant, 'messaging.settings_updated', p_tenant::text,
    '{}'::jsonb, null, auth.uid());
END; $$;
REVOKE ALL ON FUNCTION public.update_messaging_settings(uuid,text,text,smallint,smallint,smallint)
  FROM public, anon;
GRANT EXECUTE ON FUNCTION public.update_messaging_settings(uuid,text,text,smallint,smallint,smallint)
  TO authenticated;

-- ============================================================
-- 15. Advanced reports (Standard/Premium), server-side aggregates
-- ============================================================
CREATE OR REPLACE FUNCTION public.attendance_insights(p_tenant uuid, p_weeks integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_from date; v_series jsonb; v_groups jsonb; v_branches jsonb; v_demo jsonb;
BEGIN
  IF NOT public.is_tenant_member(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  v_from := current_date - (greatest(least(coalesce(p_weeks,12), 52), 1) * 7);

  SELECT coalesce(jsonb_agg(x ORDER BY x->>'service_date'), '[]'::jsonb) INTO v_series FROM (
    SELECT jsonb_build_object('service_date', s.service_date, 'name', s.name,
      'total', count(a.id),
      'first_timers', count(a.id) FILTER (WHERE m.status = 'first_timer')) AS x
    FROM public.services s
    LEFT JOIN public.attendance a ON a.service_id = s.id
    LEFT JOIN public.members m ON m.id = a.member_id
    WHERE s.tenant_id = p_tenant AND s.service_date >= v_from
    GROUP BY s.id, s.service_date, s.name) q;

  IF public.tenant_has_feature(p_tenant, 'groups') THEN
    SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_groups FROM (
      SELECT jsonb_build_object('group_name', p.group_name,
        'members', count(DISTINCT m.id), 'attendances', count(a.id)) AS x
      FROM public.positions p
      LEFT JOIN public.members m ON m.position_id = p.id
      LEFT JOIN public.attendance a ON a.member_id = m.id AND a.recorded_at >= v_from
      WHERE p.tenant_id = p_tenant
      GROUP BY p.id, p.group_name ORDER BY count(a.id) DESC LIMIT 40) q;
  ELSE v_groups := '[]'::jsonb; END IF;

  IF public.tenant_has_feature(p_tenant, 'branches') THEN
    SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO v_branches FROM (
      SELECT jsonb_build_object('branch', b.name,
        'members', count(DISTINCT m.id), 'attendances', count(a.id)) AS x
      FROM public.branches b
      LEFT JOIN public.members m ON m.branch_id = b.id
      LEFT JOIN public.attendance a ON a.branch_id = b.id AND a.recorded_at >= v_from
      WHERE b.tenant_id = p_tenant
      GROUP BY b.id, b.name ORDER BY b.name) q;
  ELSE v_branches := '[]'::jsonb; END IF;

  SELECT jsonb_build_object(
    'male', count(*) FILTER (WHERE gender = 'male'),
    'female', count(*) FILTER (WHERE gender = 'female'),
    'married', count(*) FILTER (WHERE marital_status = 'married'),
    'single', count(*) FILTER (WHERE marital_status = 'single'),
    'minors', count(*) FILTER (WHERE is_minor),
    'total', count(*)) INTO v_demo
  FROM public.members WHERE tenant_id = p_tenant AND status IN ('first_timer','active');

  RETURN jsonb_build_object('services', v_series, 'groups', v_groups,
    'branches', v_branches, 'demographics', v_demo);
END; $$;
REVOKE ALL ON FUNCTION public.attendance_insights(uuid, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.attendance_insights(uuid, integer) TO authenticated;

-- ============================================================
-- 16. Seat limit enforcement on staff invitations
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_add_staff(p_tenant uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (SELECT count(*) FROM public.tenant_users
          WHERE tenant_id = p_tenant AND status = 'active')
         < public.tenant_limit(p_tenant, 'staff_seats')
$$;
REVOKE ALL ON FUNCTION public.can_add_staff(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.can_add_staff(uuid) TO authenticated, service_role;