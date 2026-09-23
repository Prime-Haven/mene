ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_notes text;

CREATE INDEX IF NOT EXISTS tenants_approval_status_idx ON public.tenants (approval_status, created_at DESC);
CREATE INDEX IF NOT EXISTS tenants_trial_ends_at_idx ON public.tenants (trial_ends_at) WHERE trial_ends_at IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS space_requests_reference_unique_idx ON public.space_requests (reference) WHERE reference IS NOT NULL;

CREATE OR REPLACE FUNCTION public.subdomain_available(p_subdomain text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT lower(trim(coalesce(p_subdomain,''))) ~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$'
     AND lower(trim(p_subdomain)) NOT IN ('www','admin','api','app','mail','status','support','billing','static','assets','super-admin','platform')
     AND NOT EXISTS (SELECT 1 FROM public.tenants WHERE subdomain = lower(trim(p_subdomain)));
$$;
REVOKE ALL ON FUNCTION public.subdomain_available(text) FROM public;
GRANT EXECUTE ON FUNCTION public.subdomain_available(text) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.provision_tenant(
  p_name text, p_subdomain text, p_tier public.tenant_tier,
  p_contact_email text DEFAULT NULL, p_contact_phone text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_tenant uuid; v_branch uuid; v_sub text; v_start date := current_date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.check_rate_limit('provision_tenant', auth.uid()::text, 5, 3600) THEN
    RAISE EXCEPTION 'Too many attempts. Please try again later.';
  END IF;
  IF EXISTS (SELECT 1 FROM public.tenant_users WHERE user_id = auth.uid()) THEN
    RAISE EXCEPTION 'This account already belongs to a church';
  END IF;
  v_sub := lower(trim(p_subdomain));
  IF NOT public.subdomain_available(v_sub) THEN RAISE EXCEPTION 'That check-in address is not available'; END IF;
  IF length(trim(coalesce(p_name,''))) < 2 OR length(trim(p_name)) > 120 THEN RAISE EXCEPTION 'Church name must be 2 to 120 characters'; END IF;
  BEGIN
    INSERT INTO public.tenants (name, subdomain, tier, contact_email, contact_phone, approval_status, status, trial_ends_at)
    VALUES (trim(p_name), v_sub, p_tier, nullif(trim(p_contact_email),''), public.normalize_phone_gh(p_contact_phone), 'pending', 'active', now() + interval '14 days')
    RETURNING id INTO v_tenant;
  EXCEPTION WHEN unique_violation THEN
    RAISE EXCEPTION 'That check-in address is already taken';
  END;
  INSERT INTO public.branches (tenant_id, name, is_default) VALUES (v_tenant, 'Main', true) RETURNING id INTO v_branch;
  INSERT INTO public.tenant_users (tenant_id, user_id, role, branch_id) VALUES (v_tenant, auth.uid(), 'owner', v_branch);
  INSERT INTO public.subscriptions (tenant_id, tier, period_start, period_end) VALUES (v_tenant, p_tier, v_start, v_start + 14);
  IF p_tier IN ('standard','premium') THEN
    INSERT INTO public.structure_levels (tenant_id, name, rank) VALUES (v_tenant, 'Leader', 1);
  END IF;
  PERFORM public.log_audit(v_tenant, 'tenant.provisioned', v_sub, jsonb_build_object('tier', p_tier, 'trial_days', 14));
  RETURN v_tenant;
END; $$;
REVOKE ALL ON FUNCTION public.provision_tenant(text,text,public.tenant_tier,text,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.provision_tenant(text,text,public.tenant_tier,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.platform_approve_church(p_tenant uuid, p_notes text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF length(coalesce(p_notes,'')) > 1000 THEN RAISE EXCEPTION 'Notes are too long'; END IF;
  UPDATE public.tenants SET approval_status='approved', status='active', approved_at=now(), admin_notes=nullif(trim(p_notes),'') WHERE id=p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Church not found'; END IF;
  INSERT INTO public.platform_audit_events(actor_user_id,action,tenant_id,detail) VALUES(auth.uid(),'church.approved',p_tenant,jsonb_build_object('notes',nullif(trim(p_notes),'')));
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.platform_approve_church(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_approve_church(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.platform_reject_church(p_tenant uuid, p_reason text DEFAULT 'Application not approved')
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_platform_admin() THEN RAISE EXCEPTION 'Not permitted'; END IF;
  IF length(trim(coalesce(p_reason,''))) < 2 OR length(p_reason) > 1000 THEN RAISE EXCEPTION 'A valid reason is required'; END IF;
  UPDATE public.tenants SET approval_status='rejected', status='closed', admin_notes=trim(p_reason) WHERE id=p_tenant;
  IF NOT FOUND THEN RAISE EXCEPTION 'Church not found'; END IF;
  INSERT INTO public.platform_audit_events(actor_user_id,action,tenant_id,detail) VALUES(auth.uid(),'church.rejected',p_tenant,jsonb_build_object('reason',trim(p_reason)));
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.platform_reject_church(uuid,text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.platform_reject_church(uuid,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.apply_successful_payment(p_reference text, p_channel text DEFAULT NULL, p_paid_at timestamptz DEFAULT now(), p_amount bigint DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_pay public.payments; v_start date;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' AND auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'not authorised'; END IF;
  SELECT * INTO v_pay FROM public.payments WHERE reference=p_reference FOR UPDATE;
  IF v_pay.id IS NULL THEN RAISE EXCEPTION 'unknown payment reference'; END IF;
  IF v_pay.status='success' THEN RETURN; END IF;
  IF p_amount IS NULL OR p_amount <> v_pay.amount_kobo THEN RAISE EXCEPTION 'payment amount does not match'; END IF;
  IF v_pay.currency <> 'USD' THEN RAISE EXCEPTION 'payment currency does not match'; END IF;
  UPDATE public.payments SET status='success',channel=coalesce(p_channel,channel),paid_at=coalesce(p_paid_at,now()) WHERE id=v_pay.id;
  SELECT greatest(period_end,current_date) INTO v_start FROM public.subscriptions WHERE tenant_id=v_pay.tenant_id FOR UPDATE;
  UPDATE public.subscriptions SET tier=v_pay.tier,pending_tier=NULL,period_start=coalesce(v_start,current_date),period_end=(coalesce(v_start,current_date)+interval '1 month')::date,payment_method=CASE WHEN p_channel='mobile_money' THEN 'momo'::public.pay_method ELSE 'card'::public.pay_method END WHERE tenant_id=v_pay.tenant_id;
  UPDATE public.tenants SET tier=v_pay.tier,status='active',trial_ends_at=NULL WHERE id=v_pay.tenant_id;
  PERFORM public.log_audit(v_pay.tenant_id,'payment.succeeded',p_reference,jsonb_build_object('tier',v_pay.tier,'amount',p_amount),NULL,NULL);
END; $$;
REVOKE ALL ON FUNCTION public.apply_successful_payment(text,text,timestamptz,bigint) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_successful_payment(text,text,timestamptz,bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.apply_space_purchase(p_reference text, p_amount bigint DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.space_requests;
BEGIN
  IF current_setting('request.jwt.claim.role', true) IS DISTINCT FROM 'service_role' AND auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'not authorised'; END IF;
  SELECT * INTO v_row FROM public.space_requests WHERE reference=p_reference FOR UPDATE;
  IF v_row.id IS NULL THEN RAISE EXCEPTION 'unknown space purchase reference'; END IF;
  IF v_row.status='paid' THEN RETURN; END IF;
  IF v_row.status<>'pending' THEN RAISE EXCEPTION 'space purchase is not pending'; END IF;
  IF p_amount IS NULL OR p_amount<>v_row.amount_cents THEN RAISE EXCEPTION 'payment amount does not match'; END IF;
  UPDATE public.space_requests SET status='paid',applied_at=now() WHERE id=v_row.id;
  UPDATE public.tenants SET extra_member_slots=coalesce(extra_member_slots,0)+v_row.extra_slots WHERE id=v_row.tenant_id;
  PERFORM public.log_audit(v_row.tenant_id,'space.granted',v_row.id::text,jsonb_build_object('slots',v_row.extra_slots,'amount',p_amount),NULL,NULL);
END; $$;
REVOKE ALL ON FUNCTION public.apply_space_purchase(text,bigint) FROM public,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_space_purchase(text,bigint) TO service_role;