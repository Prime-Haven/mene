-- ==============================================================================
-- Mene Platform & Church Management System - Standalone Database Migration
-- Run this script in your Supabase SQL Editor.
-- ==============================================================================

-- 1. Enable pgcrypto for secure cryptographic hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 2. Super Admin Credentials Table
CREATE TABLE IF NOT EXISTS public.super_admin_credentials (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Protect credentials with Row Level Security
ALTER TABLE public.super_admin_credentials ENABLE ROW LEVEL SECURITY;

-- Revoke all direct public and anon access
REVOKE ALL ON public.super_admin_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.super_admin_credentials TO service_role;

-- Seed default operator credentials:
-- Username: master
-- Password: Money@2026
INSERT INTO public.super_admin_credentials (id, username, password_hash)
VALUES (
  1,
  'master',
  crypt('Money@2026', gen_salt('bf', 10))
)
ON CONFLICT (id) DO UPDATE
SET username = EXCLUDED.username,
    password_hash = EXCLUDED.password_hash,
    updated_at = now();

-- 3. Super Admin Verification RPC
CREATE OR REPLACE FUNCTION public.verify_super_admin_credentials(
  p_username text,
  p_password text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_rec record;
  v_token text;
BEGIN
  -- Rate limiting protection: 10 attempts per IP/minute
  IF NOT public.check_rate_limit('super_admin_login', coalesce(p_username, 'anon'), 10, 60) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Too many attempts. Please wait a minute and try again.');
  END IF;

  SELECT * INTO v_rec
  FROM public.super_admin_credentials
  WHERE username = btrim(p_username);

  IF v_rec IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Invalid operator credentials');
  END IF;

  IF v_rec.password_hash = crypt(p_password, v_rec.password_hash) THEN
    -- Generate session verification token
    v_token := encode(digest(p_username || ':' || now()::text || ':' || gen_random_uuid()::text, 'sha256'), 'hex');
    
    RETURN jsonb_build_object(
      'success', true,
      'username', v_rec.username,
      'token', v_token,
      'message', 'Operator authenticated successfully'
    );
  ELSE
    RETURN jsonb_build_object('success', false, 'message', 'Invalid operator credentials');
  END IF;
END;
$$;

-- Allow anon and authenticated to execute the verification RPC
GRANT EXECUTE ON FUNCTION public.verify_super_admin_credentials(text, text) TO anon, authenticated, service_role;

-- Helper to rotate super admin password easily
CREATE OR REPLACE FUNCTION public.set_super_admin_password(
  p_username text,
  p_new_password text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
BEGIN
  IF length(coalesce(p_new_password, '')) < 8 THEN
    RAISE EXCEPTION 'Password must be at least 8 characters long';
  END IF;

  UPDATE public.super_admin_credentials
  SET password_hash = crypt(p_new_password, gen_salt('bf', 10)),
      updated_at = now()
  WHERE username = btrim(p_username);

  RETURN FOUND;
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_super_admin_password(text, text) TO service_role;

-- 4. Church Onboarding & Approval Fields
ALTER TABLE public.tenants 
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved' CHECK (approval_status IN ('pending_approval', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS package_selected text DEFAULT 'basic',
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS admin_notes text;

-- 5. RPC to Approve Pending Church Registration
CREATE OR REPLACE FUNCTION public.platform_approve_church(
  p_tenant uuid,
  p_notes text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Verify operator access
  IF NOT (public.is_platform_admin() OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Not permitted: Operator role required';
  END IF;

  UPDATE public.tenants
  SET approval_status = 'approved',
      status = 'active',
      approved_at = now(),
      admin_notes = coalesce(p_notes, admin_notes)
  WHERE id = p_tenant;

  -- Activate associated subscription
  UPDATE public.subscriptions
  SET status = 'active'
  WHERE tenant_id = p_tenant;

  -- Log platform event
  INSERT INTO public.platform_audit_events (actor_user_id, action, tenant_id, detail)
  VALUES (
    coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    'church_approved',
    p_tenant,
    jsonb_build_object('notes', p_notes, 'timestamp', now())
  );

  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.platform_approve_church(uuid, text) TO authenticated, service_role;

-- 6. RPC to Reject Pending Church Registration
CREATE OR REPLACE FUNCTION public.platform_reject_church(
  p_tenant uuid,
  p_reason text DEFAULT 'Application not approved'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_platform_admin() OR auth.role() = 'service_role') THEN
    RAISE EXCEPTION 'Not permitted: Operator role required';
  END IF;

  UPDATE public.tenants
  SET approval_status = 'rejected',
      status = 'closed',
      admin_notes = p_reason
  WHERE id = p_tenant;

  INSERT INTO public.platform_audit_events (actor_user_id, action, tenant_id, detail)
  VALUES (
    coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid),
    'church_rejected',
    p_tenant,
    jsonb_build_object('reason', p_reason, 'timestamp', now())
  );

  RETURN true;
END;
$$;
GRANT EXECUTE ON FUNCTION public.platform_reject_church(uuid, text) TO authenticated, service_role;

-- 7. Ensure Public Leader Queries are accessible for Check-in page
GRANT EXECUTE ON FUNCTION public.public_leader_types(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_leader_options(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tenant_branding(text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.public_open_services(text) TO anon, authenticated, service_role;

-- Complete notification
SELECT 'Mene migration completed successfully' AS status;
