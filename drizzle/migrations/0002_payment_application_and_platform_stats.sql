-- Applies a verified successful Paystack charge: marks the payment, promotes any
-- pending tier, extends the subscription period and reactivates the church.
-- Service-role only: called from the signature-verified webhook route.
CREATE OR REPLACE FUNCTION public.apply_successful_payment(
  p_reference text,
  p_channel text DEFAULT NULL,
  p_paid_at timestamptz DEFAULT now(),
  p_amount bigint DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payment public.payments;
  v_start date;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not permitted';
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'unknown payment reference';
  END IF;

  -- Idempotent: a repeated webhook delivery is a no-op.
  IF v_payment.status = 'success' THEN
    RETURN;
  END IF;

  IF p_amount IS NOT NULL AND p_amount < v_payment.amount_kobo THEN
    UPDATE public.payments
       SET status = 'underpaid', channel = p_channel, paid_at = p_paid_at
     WHERE id = v_payment.id;
    RETURN;
  END IF;

  UPDATE public.payments
     SET status = 'success', channel = p_channel, paid_at = p_paid_at
   WHERE id = v_payment.id;

  SELECT GREATEST(period_end, CURRENT_DATE) INTO v_start
    FROM public.subscriptions WHERE tenant_id = v_payment.tenant_id;

  UPDATE public.subscriptions
     SET tier = v_payment.tier,
         pending_tier = NULL,
         period_start = COALESCE(v_start, CURRENT_DATE),
         period_end = COALESCE(v_start, CURRENT_DATE) + INTERVAL '1 year',
         payment_method = CASE WHEN p_channel = 'mobile_money' THEN 'momo'::pay_method ELSE 'card'::pay_method END
   WHERE tenant_id = v_payment.tenant_id;

  UPDATE public.tenants
     SET tier = v_payment.tier, status = 'active'
   WHERE id = v_payment.tenant_id;

  PERFORM public.log_audit(
    v_payment.tenant_id,
    'payment.succeeded',
    p_reference,
    jsonb_build_object('tier', v_payment.tier, 'channel', p_channel),
    NULL,
    NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_successful_payment(text, text, timestamptz, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_successful_payment(text, text, timestamptz, bigint) TO service_role;

-- Platform-wide roll-up for Prime Haven staff. Readable only by platform admins.
CREATE OR REPLACE FUNCTION public.platform_overview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v jsonb;
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not permitted';
  END IF;

  SELECT jsonb_build_object(
    'tenants', (SELECT count(*) FROM public.tenants),
    'active_tenants', (SELECT count(*) FROM public.tenants WHERE status = 'active'),
    'members', (SELECT count(*) FROM public.members WHERE status <> 'anonymised'),
    'attendance_30d', (SELECT count(*) FROM public.attendance WHERE recorded_at > now() - INTERVAL '30 days'),
    'by_tier', (SELECT jsonb_object_agg(tier, n) FROM (SELECT tier, count(*) AS n FROM public.tenants GROUP BY tier) t),
    'revenue_ghs_90d', (SELECT COALESCE(sum(amount_kobo), 0) / 100.0 FROM public.payments WHERE status = 'success' AND paid_at > now() - INTERVAL '90 days'),
    'churches', (
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', x.id, 'name', x.name, 'subdomain', x.subdomain, 'tier', x.tier,
        'status', x.status, 'created_at', x.created_at, 'members', x.members
      ) ORDER BY x.created_at DESC), '[]'::jsonb)
      FROM (
        SELECT t.id, t.name, t.subdomain, t.tier, t.status, t.created_at,
               (SELECT count(*) FROM public.members m WHERE m.tenant_id = t.id AND m.status <> 'anonymised') AS members
        FROM public.tenants t
        ORDER BY t.created_at DESC
        LIMIT 200
      ) x
    )
  ) INTO v;

  RETURN v;
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.platform_overview() TO service_role;

-- Platform staff can suspend or restore a church account (support action).
CREATE OR REPLACE FUNCTION public.platform_set_tenant_status(p_tenant uuid, p_status tenant_status)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN
    RAISE EXCEPTION 'not permitted';
  END IF;

  UPDATE public.tenants SET status = p_status WHERE id = p_tenant;

  PERFORM public.log_audit(p_tenant, 'tenant.status_changed', p_status::text, NULL, NULL, auth.uid());
END;
$$;

GRANT EXECUTE ON FUNCTION public.platform_set_tenant_status(uuid, tenant_status) TO authenticated;