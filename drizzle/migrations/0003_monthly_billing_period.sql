CREATE OR REPLACE FUNCTION public.apply_successful_payment(p_reference text, p_channel text DEFAULT NULL, p_paid_at timestamptz DEFAULT now(), p_amount bigint DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pay public.payments;
  v_start date;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role'
     AND auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'not authorised';
  END IF;

  SELECT * INTO v_pay FROM public.payments WHERE reference = p_reference FOR UPDATE;
  IF v_pay.id IS NULL THEN
    RAISE EXCEPTION 'unknown payment reference';
  END IF;
  IF v_pay.status = 'success' THEN
    RETURN;
  END IF;

  UPDATE public.payments
     SET status = 'success',
         channel = COALESCE(p_channel, channel),
         paid_at = COALESCE(p_paid_at, now()),
         amount_kobo = COALESCE(p_amount, amount_kobo)
   WHERE id = v_pay.id;

  SELECT GREATEST(period_end, CURRENT_DATE) INTO v_start
    FROM public.subscriptions WHERE tenant_id = v_pay.tenant_id FOR UPDATE;

  UPDATE public.subscriptions
     SET tier = v_pay.tier,
         pending_tier = NULL,
         period_start = COALESCE(v_start, CURRENT_DATE),
         period_end = COALESCE(v_start, CURRENT_DATE) + INTERVAL '1 month',
         payment_method = CASE WHEN p_channel = 'mobile_money' THEN 'momo'::pay_method ELSE 'card'::pay_method END
   WHERE tenant_id = v_pay.tenant_id;

  UPDATE public.tenants
     SET tier = v_pay.tier,
         status = 'active'
   WHERE id = v_pay.tenant_id;

  PERFORM public.log_audit(v_pay.tenant_id, 'payment.succeeded', p_reference,
    jsonb_build_object('tier', v_pay.tier, 'amount', COALESCE(p_amount, v_pay.amount_kobo)), NULL, NULL);
END;
$$;