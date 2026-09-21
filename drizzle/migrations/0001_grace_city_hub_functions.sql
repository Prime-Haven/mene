-- ============================================================
-- Business logic as security-definer functions
-- ============================================================
create or replace function public.normalize_phone_gh(_phone text)
returns text language plpgsql immutable set search_path = public as $$
declare d text;
begin
  if _phone is null then return null; end if;
  d := regexp_replace(_phone, '[^0-9+]', '', 'g');
  if d = '' then return null; end if;
  if left(d,1) = '+' then return d; end if;
  if left(d,3) = '233' then return '+' || d; end if;
  if left(d,1) = '0' then return '+233' || substr(d,2); end if;
  return '+233' || d;
end; $$;

-- ---------- tenant provisioning ----------
create or replace function public.provision_tenant(
  p_name text, p_subdomain text, p_tier public.tenant_tier,
  p_contact_email text default null, p_contact_phone text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_branch uuid; v_sub text;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.check_rate_limit('provision_tenant', auth.uid()::text, 5, 3600) then
    raise exception 'Too many attempts. Please try again later.';
  end if;

  v_sub := lower(trim(p_subdomain));
  if v_sub !~ '^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$' then
    raise exception 'Subdomain must be 3-40 characters, lowercase letters, numbers and hyphens';
  end if;
  if v_sub in ('www','admin','api','app','mail','status','support','billing','static','assets') then
    raise exception 'That subdomain is reserved';
  end if;
  if exists (select 1 from public.tenants where subdomain = v_sub) then
    raise exception 'That subdomain is already taken';
  end if;
  if length(trim(coalesce(p_name,''))) < 2 then raise exception 'Church name is required'; end if;

  insert into public.tenants (name, subdomain, tier, contact_email, contact_phone)
  values (trim(p_name), v_sub, p_tier, nullif(p_contact_email,''), public.normalize_phone_gh(p_contact_phone))
  returning id into v_tenant;

  insert into public.branches (tenant_id, name, is_default)
  values (v_tenant, 'Main', true) returning id into v_branch;

  insert into public.tenant_users (tenant_id, user_id, role, branch_id)
  values (v_tenant, auth.uid(), 'owner', v_branch);

  insert into public.subscriptions (tenant_id, tier) values (v_tenant, p_tier);

  if p_tier in ('standard','premium') then
    insert into public.structure_levels (tenant_id, name, rank) values (v_tenant, 'Leader', 1);
  end if;

  perform public.log_audit(v_tenant, 'tenant.provisioned', v_sub,
    jsonb_build_object('tier', p_tier));
  return v_tenant;
end; $$;
revoke all on function public.provision_tenant(text,text,public.tenant_tier,text,text) from public, anon;
grant execute on function public.provision_tenant(text,text,public.tenant_tier,text,text) to authenticated;

create or replace function public.subdomain_available(p_subdomain text)
returns boolean language sql security definer set search_path = public as $$
  select not exists (select 1 from public.tenants where subdomain = lower(trim(p_subdomain)))
     and lower(trim(p_subdomain)) not in ('www','admin','api','app','mail','status','support','billing','static','assets');
$$;
revoke all on function public.subdomain_available(text) from public, anon;
grant execute on function public.subdomain_available(text) to authenticated, service_role;

-- ---------- QR issuing ----------
create or replace function public.issue_qr_token(p_member uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_branch uuid; v_token text;
begin
  select tenant_id, branch_id into v_tenant, v_branch from public.members where id = p_member;
  if v_tenant is null then raise exception 'Member not found'; end if;
  if not (public.is_tenant_admin(v_tenant)
     or (public.has_tenant_role(v_tenant, array['branch_admin']::public.app_role[])
         and v_branch is not distinct from public.user_branch(v_tenant))) then
    raise exception 'Not permitted';
  end if;
  if not public.check_rate_limit('issue_qr', auth.uid()::text, 300, 3600) then
    raise exception 'Rate limit exceeded';
  end if;

  update public.qr_tokens set revoked_at = now()
   where member_id = p_member and revoked_at is null;

  v_token := encode(gen_random_bytes(16), 'hex');
  insert into public.qr_tokens (token_hash, tenant_id, member_id)
  values (digest(v_token, 'sha256'), v_tenant, p_member);

  perform public.log_audit(v_tenant, 'qr.issued', p_member::text);
  return v_token;
end; $$;
revoke all on function public.issue_qr_token(uuid) from public, anon;
grant execute on function public.issue_qr_token(uuid) to authenticated;

-- ---------- scanning ----------
create or replace function public.resolve_scan(p_token text, p_service uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant uuid; v_member uuid; v_name text; v_branch uuid; v_pos uuid; v_svc record; v_new boolean;
begin
  if auth.uid() is null then raise exception 'Not authenticated'; end if;
  if not public.check_rate_limit('scan', auth.uid()::text, 600, 3600) then
    raise exception 'Rate limit exceeded';
  end if;

  select * into v_svc from public.services where id = p_service;
  if v_svc is null then raise exception 'Service not found'; end if;
  if not public.is_tenant_member(v_svc.tenant_id) then raise exception 'Not permitted'; end if;
  if not public.tenant_can_write(v_svc.tenant_id) then raise exception 'Subscription inactive'; end if;
  if not v_svc.is_open then raise exception 'Service is closed'; end if;

  select q.tenant_id, q.member_id into v_tenant, v_member
  from public.qr_tokens q
  where q.token_hash = digest(coalesce(p_token,''), 'sha256')
    and q.revoked_at is null and q.tenant_id = v_svc.tenant_id;

  if v_member is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_code');
  end if;

  select full_name, branch_id, position_id into v_name, v_branch, v_pos
  from public.members where id = v_member;

  if not public.can_read_member(v_tenant, v_branch, v_pos)
     and not public.has_tenant_role(v_tenant, array['usher']::public.app_role[]) then
    return jsonb_build_object('ok', false, 'reason', 'out_of_scope');
  end if;

  insert into public.attendance (tenant_id, service_id, member_id, branch_id, position_id, scanned_by_user_id, method)
  values (v_tenant, p_service, v_member, coalesce(v_branch, v_svc.branch_id), v_pos, auth.uid(), 'scan')
  on conflict (service_id, member_id) do nothing;
  v_new := found;

  return jsonb_build_object('ok', true, 'member_name', v_name, 'duplicate', not v_new);
end; $$;
revoke all on function public.resolve_scan(text, uuid) from public, anon;
grant execute on function public.resolve_scan(text, uuid) to authenticated;

create or replace function public.manual_attendance(p_member uuid, p_service uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_svc record; v_branch uuid; v_pos uuid; v_tenant uuid; v_new boolean;
begin
  select * into v_svc from public.services where id = p_service;
  if v_svc is null then raise exception 'Service not found'; end if;
  if not public.is_tenant_member(v_svc.tenant_id) then raise exception 'Not permitted'; end if;
  if not public.tenant_can_write(v_svc.tenant_id) then raise exception 'Subscription inactive'; end if;
  select tenant_id, branch_id, position_id into v_tenant, v_branch, v_pos from public.members where id = p_member;
  if v_tenant is distinct from v_svc.tenant_id then raise exception 'Member not found'; end if;
  insert into public.attendance (tenant_id, service_id, member_id, branch_id, position_id, scanned_by_user_id, method)
  values (v_tenant, p_service, p_member, coalesce(v_branch, v_svc.branch_id), v_pos, auth.uid(), 'manual')
  on conflict (service_id, member_id) do nothing;
  v_new := found;
  return jsonb_build_object('ok', true, 'duplicate', not v_new);
end; $$;
revoke all on function public.manual_attendance(uuid, uuid) from public, anon;
grant execute on function public.manual_attendance(uuid, uuid) to authenticated;

-- ---------- public self check-in (called only from the server with service role) ----------
create or replace function public.tenant_branding(p_subdomain text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare t record;
begin
  select id, name, subdomain, logo_path, status, group_vocabulary
    into t from public.tenants where subdomain = lower(trim(coalesce(p_subdomain,'')));
  if t is null then return null; end if;
  return jsonb_build_object('id', t.id, 'name', t.name, 'subdomain', t.subdomain,
    'logo_path', t.logo_path, 'active', t.status in ('active','grace'));
end; $$;
revoke all on function public.tenant_branding(text) from public, anon;
grant execute on function public.tenant_branding(text) to service_role;

create or replace function public.self_checkin(
  p_subdomain text, p_full_name text, p_phone text, p_email text default null,
  p_dob date default null, p_gender public.gender_type default null,
  p_area text default null, p_ip text default null
) returns jsonb language plpgsql security definer set search_path = public as $$
declare v_tenant record; v_branch uuid; v_service uuid; v_member uuid;
        v_phone text; v_token text; v_existing boolean := false;
begin
  select * into v_tenant from public.tenants where subdomain = lower(trim(coalesce(p_subdomain,'')));
  if v_tenant is null then raise exception 'Church not found'; end if;
  if v_tenant.status not in ('active','grace') then raise exception 'This church is not accepting check-ins right now'; end if;

  if not public.check_rate_limit('self_checkin_ip', coalesce(p_ip,'unknown'), 10, 600) then
    raise exception 'Too many check-ins from this device. Please wait a few minutes.';
  end if;
  if not public.check_rate_limit('self_checkin_tenant', v_tenant.id::text, 400, 3600) then
    raise exception 'Check-in is temporarily unavailable. Please ask an usher for help.';
  end if;

  if length(trim(coalesce(p_full_name,''))) < 2 then raise exception 'Please enter your full name'; end if;
  v_phone := public.normalize_phone_gh(p_phone);
  if v_phone is null or length(v_phone) < 10 then raise exception 'Please enter a valid phone number'; end if;

  select id into v_branch from public.branches where tenant_id = v_tenant.id order by is_default desc, created_at limit 1;

  select id into v_member from public.members
   where tenant_id = v_tenant.id and phone = v_phone limit 1;

  if v_member is null then
    insert into public.members (tenant_id, branch_id, full_name, phone, email, date_of_birth,
                                gender, residential_area, status)
    values (v_tenant.id, v_branch, trim(p_full_name), v_phone, nullif(p_email,''), p_dob,
            p_gender, nullif(p_area,''), 'first_timer')
    returning id into v_member;
  else
    v_existing := true;
  end if;

  update public.qr_tokens set revoked_at = now() where member_id = v_member and revoked_at is null;
  v_token := encode(gen_random_bytes(16), 'hex');
  insert into public.qr_tokens (token_hash, tenant_id, member_id)
  values (digest(v_token, 'sha256'), v_tenant.id, v_member);

  select id into v_service from public.services
   where tenant_id = v_tenant.id and is_open and service_date = current_date
   order by created_at desc limit 1;

  if v_service is not null then
    insert into public.attendance (tenant_id, service_id, member_id, branch_id, method)
    values (v_tenant.id, v_service, v_member, v_branch, 'self_checkin')
    on conflict (service_id, member_id) do nothing;
  end if;

  perform public.log_audit(v_tenant.id, 'member.self_checkin', v_member::text,
    jsonb_build_object('returning', v_existing), p_ip, null);

  return jsonb_build_object('ok', true, 'member_id', v_member, 'token', v_token,
    'returning', v_existing, 'checked_in', v_service is not null,
    'church', v_tenant.name);
end; $$;
revoke all on function public.self_checkin(text,text,text,text,date,public.gender_type,text,text) from public, anon, authenticated;
grant execute on function public.self_checkin(text,text,text,text,date,public.gender_type,text,text) to service_role;

-- ---------- dashboard metrics ----------
create or replace function public.tenant_dashboard(p_tenant uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  if not public.is_tenant_member(p_tenant) then raise exception 'Not permitted'; end if;
  select jsonb_build_object(
    'members', (select count(*) from public.members where tenant_id = p_tenant and status <> 'anonymised'),
    'first_timers_30d', (select count(*) from public.members where tenant_id = p_tenant and status = 'first_timer' and created_at > now() - interval '30 days'),
    'services', (select count(*) from public.services where tenant_id = p_tenant),
    'last_service_attendance', (
      select count(distinct a.member_id) from public.attendance a
      where a.tenant_id = p_tenant and a.service_id = (
        select id from public.services where tenant_id = p_tenant order by service_date desc, created_at desc limit 1)),
    'trend', (
      select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) from (
        select s.name, s.service_date,
               (select count(distinct a.member_id) from public.attendance a where a.service_id = s.id) as attendance
        from public.services s where s.tenant_id = p_tenant
        order by s.service_date desc limit 12
      ) t),
    'gender', (
      select coalesce(jsonb_agg(row_to_json(g)), '[]'::jsonb) from (
        select coalesce(gender::text,'unspecified') as label, count(*) as value
        from public.members where tenant_id = p_tenant group by 1
      ) g),
    'age_bands', (
      select coalesce(jsonb_agg(row_to_json(b)), '[]'::jsonb) from (
        select case
          when date_of_birth is null then 'Unknown'
          when date_of_birth > current_date - interval '18 years' then '0-17'
          when date_of_birth > current_date - interval '30 years' then '18-29'
          when date_of_birth > current_date - interval '45 years' then '30-44'
          when date_of_birth > current_date - interval '60 years' then '45-59'
          else '60+' end as label, count(*) as value
        from public.members where tenant_id = p_tenant group by 1 order by 1
      ) b)
  ) into v;
  return v;
end; $$;
revoke all on function public.tenant_dashboard(uuid) from public, anon;
grant execute on function public.tenant_dashboard(uuid) to authenticated;

create or replace function public.birthdays_this_month(p_tenant uuid)
returns table (id uuid, full_name text, date_of_birth date, phone text)
language sql security definer set search_path = public as $$
  select m.id, m.full_name, m.date_of_birth,
         case when m.is_minor and not public.is_tenant_admin(p_tenant) then null else m.phone end
  from public.members m
  where m.tenant_id = p_tenant
    and public.is_tenant_member(p_tenant)
    and m.date_of_birth is not null
    and extract(month from m.date_of_birth) = extract(month from current_date)
    and m.status <> 'anonymised'
  order by extract(day from m.date_of_birth);
$$;
revoke all on function public.birthdays_this_month(uuid) from public, anon;
grant execute on function public.birthdays_this_month(uuid) to authenticated;

-- ---------- data subject rights ----------
create or replace function public.anonymise_member(p_member uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tenant uuid;
begin
  select tenant_id into v_tenant from public.members where id = p_member;
  if v_tenant is null or not public.is_tenant_admin(v_tenant) then raise exception 'Not permitted'; end if;
  delete from public.qr_tokens where member_id = p_member;
  update public.attendance set member_id = null where member_id = p_member;
  update public.members set full_name = 'Anonymised member', phone = null, email = null,
     date_of_birth = null, gender = null, residential_area = null, status = 'anonymised'
   where id = p_member;
  perform public.log_audit(v_tenant, 'member.anonymised', p_member::text);
end; $$;
revoke all on function public.anonymise_member(uuid) from public, anon;
grant execute on function public.anonymise_member(uuid) to authenticated;
