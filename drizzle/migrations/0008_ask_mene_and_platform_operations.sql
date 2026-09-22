CREATE TABLE public.ask_mene_conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES public.tenants(id) ON DELETE CASCADE,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ask_mene_conversations TO authenticated;
GRANT ALL ON public.ask_mene_conversations TO service_role;
ALTER TABLE public.ask_mene_conversations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant admins read ask mene conversation" ON public.ask_mene_conversations
  FOR SELECT TO authenticated USING (public.is_tenant_admin(tenant_id));
CREATE POLICY "tenant admins create ask mene conversation" ON public.ask_mene_conversations
  FOR INSERT TO authenticated WITH CHECK (public.is_tenant_admin(tenant_id) AND updated_by = auth.uid());
CREATE POLICY "tenant admins update ask mene conversation" ON public.ask_mene_conversations
  FOR UPDATE TO authenticated USING (public.is_tenant_admin(tenant_id))
  WITH CHECK (public.is_tenant_admin(tenant_id) AND updated_by = auth.uid());
CREATE POLICY "tenant admins delete ask mene conversation" ON public.ask_mene_conversations
  FOR DELETE TO authenticated USING (public.is_tenant_admin(tenant_id));

CREATE TABLE public.ask_mene_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES public.ask_mene_conversations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user','assistant')),
  content text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 12000),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, DELETE ON public.ask_mene_messages TO authenticated;
GRANT ALL ON public.ask_mene_messages TO service_role;
ALTER TABLE public.ask_mene_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tenant admins read ask mene messages" ON public.ask_mene_messages
  FOR SELECT TO authenticated USING (public.is_tenant_admin(tenant_id));
CREATE POLICY "tenant admins create ask mene messages" ON public.ask_mene_messages
  FOR INSERT TO authenticated WITH CHECK (
    public.is_tenant_admin(tenant_id)
    AND created_by = auth.uid()
    AND EXISTS (SELECT 1 FROM public.ask_mene_conversations c WHERE c.id = conversation_id AND c.tenant_id = tenant_id)
  );
CREATE POLICY "tenant admins clear ask mene messages" ON public.ask_mene_messages
  FOR DELETE TO authenticated USING (public.is_tenant_admin(tenant_id));
CREATE INDEX ask_mene_messages_conversation_created_idx
  ON public.ask_mene_messages(conversation_id, created_at);

CREATE TABLE public.platform_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid NOT NULL,
  action text NOT NULL,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE SET NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.platform_audit_events TO authenticated;
GRANT ALL ON public.platform_audit_events TO service_role;
ALTER TABLE public.platform_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "platform admins read platform audit" ON public.platform_audit_events
  FOR SELECT TO authenticated USING (public.is_platform_admin());
CREATE INDEX platform_audit_events_created_idx ON public.platform_audit_events(created_at DESC);

CREATE OR REPLACE FUNCTION public.ask_mene_context(p_tenant uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_tenant_admin(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  SELECT jsonb_build_object(
    'church', jsonb_build_object('name', t.name, 'tier', t.tier, 'status', t.status),
    'summary', jsonb_build_object(
      'members', (SELECT count(*) FROM public.members m WHERE m.tenant_id=t.id AND m.status IN ('active','first_timer')),
      'first_timers_30d', (SELECT count(*) FROM public.members m WHERE m.tenant_id=t.id AND m.status='first_timer' AND m.created_at >= now()-interval '30 days'),
      'services_30d', (SELECT count(*) FROM public.services s WHERE s.tenant_id=t.id AND s.service_date >= current_date-30),
      'attendance_30d', (SELECT count(*) FROM public.attendance a WHERE a.tenant_id=t.id AND a.recorded_at >= now()-interval '30 days')
    ),
    'demographics', (SELECT jsonb_build_object(
      'male', count(*) FILTER (WHERE gender='male'), 'female', count(*) FILTER (WHERE gender='female'),
      'other', count(*) FILTER (WHERE gender='other'), 'minors', count(*) FILTER (WHERE is_minor),
      'single', count(*) FILTER (WHERE marital_status='single'), 'married', count(*) FILTER (WHERE marital_status='married'))
      FROM public.members m WHERE m.tenant_id=t.id AND m.status IN ('active','first_timer')),
    'recent_services', (SELECT coalesce(jsonb_agg(x ORDER BY x.service_date DESC), '[]'::jsonb) FROM (
      SELECT s.name, s.service_date, count(a.id) AS attendance
      FROM public.services s LEFT JOIN public.attendance a ON a.service_id=s.id
      WHERE s.tenant_id=t.id GROUP BY s.id, s.name, s.service_date ORDER BY s.service_date DESC LIMIT 16
    ) x),
    'branches', CASE WHEN public.tenant_has_feature(t.id,'branches') THEN
      (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT b.name, count(DISTINCT m.id) AS members, count(DISTINCT a.id) AS attendance_30d
        FROM public.branches b LEFT JOIN public.members m ON m.branch_id=b.id AND m.status IN ('active','first_timer')
        LEFT JOIN public.attendance a ON a.branch_id=b.id AND a.recorded_at >= now()-interval '30 days'
        WHERE b.tenant_id=t.id GROUP BY b.id,b.name ORDER BY b.name
      ) x) ELSE '[]'::jsonb END,
    'groups', CASE WHEN public.tenant_has_feature(t.id,'groups') THEN
      (SELECT coalesce(jsonb_agg(x), '[]'::jsonb) FROM (
        SELECT p.group_name, count(DISTINCT m.id) AS members, count(DISTINCT a.id) AS attendance_30d
        FROM public.positions p LEFT JOIN public.members m ON m.position_id=p.id AND m.status IN ('active','first_timer')
        LEFT JOIN public.attendance a ON a.position_id=p.id AND a.recorded_at >= now()-interval '30 days'
        WHERE p.tenant_id=t.id GROUP BY p.id,p.group_name ORDER BY p.group_name LIMIT 50
      ) x) ELSE '[]'::jsonb END,
    'limits', jsonb_build_object(
      'member_limit', public.tenant_limit(t.id,'member_limit'),
      'staff_seats', public.tenant_limit(t.id,'staff_seats'),
      'daily_messages', public.tenant_limit(t.id,'daily_messages'))
  ) INTO v FROM public.tenants t WHERE t.id=p_tenant;
  IF v IS NULL THEN RAISE EXCEPTION 'Church not found'; END IF;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.ask_mene_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ask_mene_context(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ask_mene_allow_request(p_tenant uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.is_tenant_admin(p_tenant) THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF NOT public.check_rate_limit('ask_mene_user', auth.uid()::text, 20, 3600) THEN RETURN false; END IF;
  IF NOT public.check_rate_limit('ask_mene_tenant', p_tenant::text, 100, 3600) THEN RETURN false; END IF;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.ask_mene_allow_request(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ask_mene_allow_request(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'not permitted'; END IF;
  SELECT jsonb_build_object(
    'tenants', (SELECT count(*) FROM public.tenants),
    'active_tenants', (SELECT count(*) FROM public.tenants WHERE status='active'),
    'grace_tenants', (SELECT count(*) FROM public.tenants WHERE status='grace'),
    'suspended_tenants', (SELECT count(*) FROM public.tenants WHERE status='suspended'),
    'members', (SELECT count(*) FROM public.members WHERE status <> 'anonymised'),
    'attendance_30d', (SELECT count(*) FROM public.attendance WHERE recorded_at > now()-interval '30 days'),
    'by_tier', (SELECT coalesce(jsonb_object_agg(tier,n),'{}'::jsonb) FROM (SELECT tier,count(*) n FROM public.tenants GROUP BY tier) q),
    'revenue_usd_90d', (SELECT coalesce(sum(amount_kobo),0)/100.0 FROM public.payments WHERE status='success' AND currency='USD' AND paid_at>now()-interval '90 days'),
    'payments_30d', (SELECT count(*) FROM public.payments WHERE created_at>now()-interval '30 days'),
    'failed_payments_30d', (SELECT count(*) FROM public.payments WHERE created_at>now()-interval '30 days' AND status='failed'),
    'churches', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',x.id,'name',x.name,'subdomain',x.subdomain,'tier',x.tier,'status',x.status,
      'contact_email',x.contact_email,'contact_phone',x.contact_phone,'created_at',x.created_at,
      'members',x.members,'staff',x.staff,'period_end',x.period_end,'auto_renew',x.auto_renew,
      'last_payment_status',x.last_payment_status,'last_payment_at',x.last_payment_at
    ) ORDER BY x.created_at DESC),'[]'::jsonb) FROM (
      SELECT t.id,t.name,t.subdomain,t.tier,t.status,t.contact_email,t.contact_phone,t.created_at,
        (SELECT count(*) FROM public.members m WHERE m.tenant_id=t.id AND m.status<>'anonymised') members,
        (SELECT count(*) FROM public.tenant_users tu WHERE tu.tenant_id=t.id AND tu.status='active') staff,
        s.period_end,s.auto_renew,
        (SELECT p.status FROM public.payments p WHERE p.tenant_id=t.id ORDER BY p.created_at DESC LIMIT 1) last_payment_status,
        (SELECT p.created_at FROM public.payments p WHERE p.tenant_id=t.id ORDER BY p.created_at DESC LIMIT 1) last_payment_at
      FROM public.tenants t LEFT JOIN public.subscriptions s ON s.tenant_id=t.id
      ORDER BY t.created_at DESC LIMIT 500
    ) x),
    'recent_payments', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'church',t.name,'tier',p.tier,'amount',p.amount_kobo/100.0,'currency',p.currency,
      'status',p.status,'channel',p.channel,'created_at',p.created_at,'paid_at',p.paid_at
    ) ORDER BY p.created_at DESC),'[]'::jsonb) FROM public.payments p JOIN public.tenants t ON t.id=p.tenant_id WHERE p.created_at>now()-interval '90 days' LIMIT 200),
    'audit', (SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',a.id,'action',a.action,'tenant_id',a.tenant_id,'church',t.name,'detail',a.detail,'created_at',a.created_at
    ) ORDER BY a.created_at DESC),'[]'::jsonb) FROM public.platform_audit_events a LEFT JOIN public.tenants t ON t.id=a.tenant_id LIMIT 200)
  ) INTO v;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_overview() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_update_tenant(
  p_tenant uuid, p_name text, p_subdomain text, p_tier public.tenant_tier,
  p_status public.tenant_status, p_contact_email text, p_contact_phone text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_old jsonb; v_sub text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'not permitted'; END IF;
  IF NOT public.check_rate_limit('platform_mutation',auth.uid()::text,60,3600) THEN RAISE EXCEPTION 'Too many changes. Please try again later.'; END IF;
  IF length(btrim(coalesce(p_name,'')))<2 OR length(p_name)>120 THEN RAISE EXCEPTION 'Enter a valid church name'; END IF;
  v_sub:=lower(btrim(coalesce(p_subdomain,'')));
  IF v_sub !~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$' THEN RAISE EXCEPTION 'Subdomain must be 3-40 lowercase letters, numbers or hyphens'; END IF;
  IF v_sub IN ('www','admin','api','app','mail','status','support','billing','static','assets') THEN RAISE EXCEPTION 'That subdomain is reserved'; END IF;
  SELECT jsonb_build_object('name',name,'subdomain',subdomain,'tier',tier,'status',status) INTO v_old FROM public.tenants WHERE id=p_tenant;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Church not found'; END IF;
  UPDATE public.tenants SET name=btrim(p_name),subdomain=v_sub,tier=p_tier,status=p_status,
    contact_email=nullif(btrim(coalesce(p_contact_email,'')),''),
    contact_phone=public.normalize_phone_gh(p_contact_phone) WHERE id=p_tenant;
  UPDATE public.subscriptions SET tier=p_tier WHERE tenant_id=p_tenant;
  INSERT INTO public.platform_audit_events(actor_user_id,action,tenant_id,detail)
    VALUES(auth.uid(),'tenant.updated',p_tenant,jsonb_build_object('before',v_old,'after',jsonb_build_object('name',btrim(p_name),'subdomain',v_sub,'tier',p_tier,'status',p_status)));
END;
$$;
REVOKE ALL ON FUNCTION public.platform_update_tenant(uuid,text,text,public.tenant_tier,public.tenant_status,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_update_tenant(uuid,text,text,public.tenant_tier,public.tenant_status,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_create_tenant(
  p_name text,p_subdomain text,p_tier public.tenant_tier,p_contact_email text,p_contact_phone text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_id uuid; v_sub text;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'not permitted'; END IF;
  IF NOT public.check_rate_limit('platform_create',auth.uid()::text,15,3600) THEN RAISE EXCEPTION 'Too many church creations. Please try again later.'; END IF;
  IF length(btrim(coalesce(p_name,'')))<2 OR length(p_name)>120 THEN RAISE EXCEPTION 'Enter a valid church name'; END IF;
  v_sub:=lower(btrim(coalesce(p_subdomain,'')));
  IF v_sub !~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$' THEN RAISE EXCEPTION 'Subdomain must be 3-40 lowercase letters, numbers or hyphens'; END IF;
  IF v_sub IN ('www','admin','api','app','mail','status','support','billing','static','assets') THEN RAISE EXCEPTION 'That subdomain is reserved'; END IF;
  INSERT INTO public.tenants(name,subdomain,tier,status,contact_email,contact_phone)
    VALUES(btrim(p_name),v_sub,p_tier,'active',nullif(btrim(coalesce(p_contact_email,'')),''),public.normalize_phone_gh(p_contact_phone)) RETURNING id INTO v_id;
  INSERT INTO public.branches(tenant_id,name,is_default) VALUES(v_id,'Main',true);
  INSERT INTO public.subscriptions(tenant_id,tier) VALUES(v_id,p_tier);
  IF p_tier IN ('standard','premium') THEN INSERT INTO public.structure_levels(tenant_id,name,rank) VALUES(v_id,'Leader',1); END IF;
  INSERT INTO public.platform_audit_events(actor_user_id,action,tenant_id,detail)
    VALUES(auth.uid(),'tenant.created',v_id,jsonb_build_object('name',btrim(p_name),'subdomain',v_sub,'tier',p_tier));
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.platform_create_tenant(text,text,public.tenant_tier,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_create_tenant(text,text,public.tenant_tier,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_set_tenant_status(p_tenant uuid,p_status public.tenant_status)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_old public.tenant_status;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'not permitted'; END IF;
  IF NOT public.check_rate_limit('platform_mutation',auth.uid()::text,60,3600) THEN RAISE EXCEPTION 'Too many changes. Please try again later.'; END IF;
  SELECT status INTO v_old FROM public.tenants WHERE id=p_tenant;
  IF v_old IS NULL THEN RAISE EXCEPTION 'Church not found'; END IF;
  UPDATE public.tenants SET status=p_status WHERE id=p_tenant;
  INSERT INTO public.platform_audit_events(actor_user_id,action,tenant_id,detail)
    VALUES(auth.uid(),'tenant.status_changed',p_tenant,jsonb_build_object('from',v_old,'to',p_status));
END;
$$;
REVOKE ALL ON FUNCTION public.platform_set_tenant_status(uuid,public.tenant_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_set_tenant_status(uuid,public.tenant_status) TO authenticated;
