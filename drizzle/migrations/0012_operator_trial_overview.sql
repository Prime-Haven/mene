CREATE OR REPLACE FUNCTION public.platform_overview()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'not permitted'; END IF;
  SELECT jsonb_build_object(
    'tenants',(SELECT count(*) FROM public.tenants),
    'active_tenants',(SELECT count(*) FROM public.tenants WHERE status='active'),
    'grace_tenants',(SELECT count(*) FROM public.tenants WHERE status='grace'),
    'suspended_tenants',(SELECT count(*) FROM public.tenants WHERE status='suspended'),
    'members',(SELECT count(*) FROM public.members WHERE status<>'anonymised'),
    'attendance_30d',(SELECT count(*) FROM public.attendance WHERE recorded_at>now()-interval '30 days'),
    'by_tier',(SELECT coalesce(jsonb_object_agg(tier,n),'{}'::jsonb) FROM (SELECT tier,count(*) n FROM public.tenants GROUP BY tier) q),
    'revenue_usd_90d',(SELECT coalesce(sum(amount_kobo),0)/100.0 FROM public.payments WHERE status='success' AND currency='USD' AND paid_at>now()-interval '90 days'),
    'payments_30d',(SELECT count(*) FROM public.payments WHERE created_at>now()-interval '30 days'),
    'failed_payments_30d',(SELECT count(*) FROM public.payments WHERE created_at>now()-interval '30 days' AND status='failed'),
    'churches',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',x.id,'name',x.name,'subdomain',x.subdomain,'tier',x.tier,'status',x.status,
      'approval_status',x.approval_status,'trial_ends_at',x.trial_ends_at,
      'contact_email',x.contact_email,'contact_phone',x.contact_phone,'created_at',x.created_at,
      'members',x.members,'staff',x.staff,'period_end',x.period_end,'auto_renew',x.auto_renew,
      'last_payment_status',x.last_payment_status,'last_payment_at',x.last_payment_at
    ) ORDER BY x.created_at DESC),'[]'::jsonb) FROM (
      SELECT t.id,t.name,t.subdomain,t.tier,t.status,t.approval_status,t.trial_ends_at,t.contact_email,t.contact_phone,t.created_at,
        (SELECT count(*) FROM public.members m WHERE m.tenant_id=t.id AND m.status<>'anonymised') members,
        (SELECT count(*) FROM public.tenant_users tu WHERE tu.tenant_id=t.id AND tu.status='active') staff,
        s.period_end,s.auto_renew,
        (SELECT p.status FROM public.payments p WHERE p.tenant_id=t.id ORDER BY p.created_at DESC LIMIT 1) last_payment_status,
        (SELECT p.created_at FROM public.payments p WHERE p.tenant_id=t.id ORDER BY p.created_at DESC LIMIT 1) last_payment_at
      FROM public.tenants t LEFT JOIN public.subscriptions s ON s.tenant_id=t.id
      ORDER BY t.created_at DESC LIMIT 500
    ) x),
    'recent_payments',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',p.id,'church',t.name,'tier',p.tier,'amount',p.amount_kobo/100.0,'currency',p.currency,
      'status',p.status,'channel',p.channel,'created_at',p.created_at,'paid_at',p.paid_at
    ) ORDER BY p.created_at DESC),'[]'::jsonb) FROM public.payments p JOIN public.tenants t ON t.id=p.tenant_id WHERE p.created_at>now()-interval '90 days' LIMIT 200),
    'audit',(SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',a.id,'action',a.action,'tenant_id',a.tenant_id,'church',t.name,'detail',a.detail,'created_at',a.created_at
    ) ORDER BY a.created_at DESC),'[]'::jsonb) FROM public.platform_audit_events a LEFT JOIN public.tenants t ON t.id=a.tenant_id LIMIT 200)
  ) INTO v;
  RETURN v;
END; $$;
REVOKE ALL ON FUNCTION public.platform_overview() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.platform_overview() TO authenticated, service_role;