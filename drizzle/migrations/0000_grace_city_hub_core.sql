-- ============================================================
-- Grace City Hub — core multi-tenant schema
-- ============================================================
create extension if not exists ltree;
create extension if not exists citext;
create extension if not exists pgcrypto;

create type public.app_role as enum ('owner','church_admin','branch_admin','leader','usher','platform_admin');
create type public.tenant_tier as enum ('basic','standard','premium');
create type public.tenant_status as enum ('active','grace','suspended','closed');
create type public.member_status as enum ('first_timer','active','archived','anonymised');
create type public.gender_type as enum ('male','female','other');
create type public.attendance_method as enum ('scan','self_checkin','manual','corrected');
create type public.pay_method as enum ('card','momo');
create type public.account_status as enum ('active','suspended');

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email citext,
  phone text,
  created_at timestamptz not null default now()
);
grant select, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own profile read" on public.profiles for select to authenticated using (id = auth.uid());
create policy "own profile update" on public.profiles for update to authenticated using (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, new.raw_user_meta_data->>'full_name', new.email)
  on conflict (id) do nothing;
  return new;
end; $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- tenants ----------
create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  subdomain citext not null unique,
  tier public.tenant_tier not null default 'basic',
  status public.tenant_status not null default 'active',
  logo_path text,
  contact_email citext,
  contact_phone text,
  group_vocabulary text not null default 'Group',
  created_at timestamptz not null default now()
);
grant select, insert, update on public.tenants to authenticated;
grant all on public.tenants to service_role;
alter table public.tenants enable row level security;

create table public.branches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  city text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);
create index on public.branches (tenant_id);
grant select, insert, update, delete on public.branches to authenticated;
grant all on public.branches to service_role;
alter table public.branches enable row level security;

-- roles live in their own table, never on profiles
create table public.tenant_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  branch_id uuid references public.branches(id) on delete set null,
  position_id uuid,
  status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id, role)
);
create index on public.tenant_users (user_id);
create index on public.tenant_users (tenant_id);
grant select, insert, update, delete on public.tenant_users to authenticated;
grant all on public.tenant_users to service_role;
alter table public.tenant_users enable row level security;

create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
grant select on public.platform_admins to authenticated;
grant all on public.platform_admins to service_role;
alter table public.platform_admins enable row level security;

-- ---------- structure ----------
create table public.structure_levels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  name text not null,
  rank int not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, rank)
);
grant select, insert, update, delete on public.structure_levels to authenticated;
grant all on public.structure_levels to service_role;
alter table public.structure_levels enable row level security;

create table public.positions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  level_id uuid not null references public.structure_levels(id) on delete cascade,
  parent_id uuid references public.positions(id) on delete set null,
  path ltree,
  group_name text not null,
  branch_id uuid references public.branches(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.positions (tenant_id);
create index on public.positions using gist (path);
grant select, insert, update, delete on public.positions to authenticated;
grant all on public.positions to service_role;
alter table public.positions enable row level security;

create or replace function public.positions_set_path()
returns trigger language plpgsql security definer set search_path = public as $$
declare parent_path ltree;
begin
  if new.parent_id is null then
    new.path := text2ltree(replace(new.id::text,'-','_'));
  else
    select path into parent_path from public.positions where id = new.parent_id;
    new.path := parent_path || text2ltree(replace(new.id::text,'-','_'));
  end if;
  return new;
end; $$;
create trigger positions_path_biu before insert or update of parent_id on public.positions
  for each row execute function public.positions_set_path();

-- ---------- members ----------
create table public.members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  position_id uuid references public.positions(id) on delete set null,
  full_name text not null,
  phone text,
  email citext,
  date_of_birth date,
  gender public.gender_type,
  residential_area text,
  is_minor boolean not null default false,
  status public.member_status not null default 'active',
  joined_on date not null default current_date,
  import_batch_id uuid,
  created_at timestamptz not null default now()
);
create index on public.members (tenant_id);
create index on public.members (tenant_id, branch_id);
create index on public.members (position_id);
create unique index members_tenant_phone_uniq on public.members (tenant_id, phone) where phone is not null;
grant select, insert, update, delete on public.members to authenticated;
grant all on public.members to service_role;
alter table public.members enable row level security;

create or replace function public.members_derive_minor()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.is_minor := new.date_of_birth is not null
    and new.date_of_birth > (current_date - interval '18 years');
  return new;
end; $$;
create trigger members_minor_biu before insert or update on public.members
  for each row execute function public.members_derive_minor();

-- ---------- qr tokens (hash only) ----------
create table public.qr_tokens (
  token_hash bytea primary key,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index on public.qr_tokens (member_id);
grant all on public.qr_tokens to service_role;
alter table public.qr_tokens enable row level security;
-- no policies for authenticated: tokens are only ever touched by security-definer functions

-- ---------- services & attendance ----------
create table public.services (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  branch_id uuid references public.branches(id) on delete set null,
  name text not null,
  service_date date not null,
  is_open boolean not null default true,
  created_at timestamptz not null default now()
);
create index on public.services (tenant_id, service_date desc);
grant select, insert, update, delete on public.services to authenticated;
grant all on public.services to service_role;
alter table public.services enable row level security;

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  member_id uuid references public.members(id) on delete set null,
  branch_id uuid references public.branches(id) on delete set null,
  position_id uuid references public.positions(id) on delete set null,
  scanned_by_user_id uuid references auth.users(id) on delete set null,
  method public.attendance_method not null default 'scan',
  recorded_at timestamptz not null default now()
);
create unique index attendance_service_member_uniq on public.attendance (service_id, member_id) where member_id is not null;
create index on public.attendance (tenant_id, recorded_at desc);
grant select, insert, update, delete on public.attendance to authenticated;
grant all on public.attendance to service_role;
alter table public.attendance enable row level security;

-- ---------- subscription & payments ----------
create table public.subscriptions (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  tier public.tenant_tier not null default 'basic',
  pending_tier public.tenant_tier,
  period_start date not null default current_date,
  period_end date not null default (current_date + interval '30 days'),
  payment_method public.pay_method not null default 'momo',
  auto_renew boolean not null default false,
  paystack_customer_code text,
  created_at timestamptz not null default now()
);
grant select on public.subscriptions to authenticated;
grant all on public.subscriptions to service_role;
alter table public.subscriptions enable row level security;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  reference text not null unique,
  amount_kobo bigint not null,
  currency text not null default 'GHS',
  tier public.tenant_tier not null,
  status text not null default 'pending',
  channel text,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.payments (tenant_id, created_at desc);
grant select on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  filename text,
  row_count int not null default 0,
  inserted_count int not null default 0,
  skipped_count int not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert on public.import_batches to authenticated;
grant all on public.import_batches to service_role;
alter table public.import_batches enable row level security;

-- ---------- audit (append only) ----------
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  branch_id uuid,
  action text not null,
  target text,
  detail jsonb,
  source_ip text,
  created_at timestamptz not null default now()
);
create index on public.audit_events (tenant_id, created_at desc);
grant select on public.audit_events to authenticated;
grant all on public.audit_events to service_role;
alter table public.audit_events enable row level security;

-- ---------- rate limiting ----------
create table public.rate_limit_hits (
  id bigserial primary key,
  bucket text not null,
  identifier text not null,
  created_at timestamptz not null default now()
);
create index on public.rate_limit_hits (bucket, identifier, created_at desc);
grant all on public.rate_limit_hits to service_role;
alter table public.rate_limit_hits enable row level security;

-- ============================================================
-- Helper functions (security definer, no RLS recursion)
-- ============================================================
create or replace function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid());
$$;

create or replace function public.is_tenant_member(_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_users
    where tenant_id = _tenant and user_id = auth.uid() and status = 'active'
  );
$$;

create or replace function public.has_tenant_role(_tenant uuid, _roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tenant_users
    where tenant_id = _tenant and user_id = auth.uid()
      and status = 'active' and role = any(_roles)
  );
$$;

create or replace function public.user_branch(_tenant uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select branch_id from public.tenant_users
  where tenant_id = _tenant and user_id = auth.uid() and status = 'active'
  order by created_at limit 1;
$$;

create or replace function public.user_position_path(_tenant uuid)
returns ltree language sql stable security definer set search_path = public as $$
  select p.path from public.tenant_users tu
  join public.positions p on p.id = tu.position_id
  where tu.tenant_id = _tenant and tu.user_id = auth.uid() and tu.status = 'active'
  limit 1;
$$;

-- tenant-wide admin (owner/church_admin)
create or replace function public.is_tenant_admin(_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.has_tenant_role(_tenant, array['owner','church_admin']::public.app_role[]);
$$;

create or replace function public.can_read_member(_tenant uuid, _branch uuid, _position uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select
    public.is_tenant_admin(_tenant)
    or (public.has_tenant_role(_tenant, array['branch_admin']::public.app_role[])
        and _branch is not distinct from public.user_branch(_tenant))
    or (public.has_tenant_role(_tenant, array['leader']::public.app_role[])
        and _position is not null
        and exists (
          select 1 from public.positions p
          where p.id = _position and p.path <@ public.user_position_path(_tenant)
        ));
$$;

create or replace function public.tenant_can_write(_tenant uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.tenants t where t.id = _tenant and t.status in ('active','grace'));
$$;

create or replace function public.log_audit(
  _tenant uuid, _action text, _target text default null,
  _detail jsonb default null, _ip text default null, _actor uuid default null
) returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_events (tenant_id, actor_user_id, action, target, detail, source_ip)
  values (_tenant, coalesce(_actor, auth.uid()), _action, _target, _detail, _ip);
end; $$;

create or replace function public.check_rate_limit(
  _bucket text, _identifier text, _max int, _window_seconds int
) returns boolean language plpgsql security definer set search_path = public as $$
declare hits int;
begin
  delete from public.rate_limit_hits
   where created_at < now() - interval '1 day';
  select count(*) into hits from public.rate_limit_hits
   where bucket = _bucket and identifier = _identifier
     and created_at > now() - make_interval(secs => _window_seconds);
  if hits >= _max then
    return false;
  end if;
  insert into public.rate_limit_hits (bucket, identifier) values (_bucket, _identifier);
  return true;
end; $$;

-- ============================================================
-- RLS policies
-- ============================================================
create policy "tenant readable by its members" on public.tenants for select to authenticated
  using (public.is_tenant_member(id) or public.is_platform_admin());
create policy "owner updates tenant" on public.tenants for update to authenticated
  using (public.has_tenant_role(id, array['owner']::public.app_role[]));

create policy "branches read" on public.branches for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy "branches write premium owner" on public.branches for insert to authenticated
  with check (public.has_tenant_role(tenant_id, array['owner']::public.app_role[])
    and exists (select 1 from public.tenants t where t.id = tenant_id and t.tier = 'premium'));
create policy "branches update premium owner" on public.branches for update to authenticated
  using (public.has_tenant_role(tenant_id, array['owner']::public.app_role[])
    and exists (select 1 from public.tenants t where t.id = tenant_id and t.tier = 'premium'));
create policy "branches delete premium owner" on public.branches for delete to authenticated
  using (public.has_tenant_role(tenant_id, array['owner']::public.app_role[])
    and exists (select 1 from public.tenants t where t.id = tenant_id and t.tier = 'premium'));

create policy "own memberships" on public.tenant_users for select to authenticated
  using (user_id = auth.uid() or public.is_tenant_admin(tenant_id));
create policy "admins manage accounts" on public.tenant_users for insert to authenticated
  with check (public.is_tenant_admin(tenant_id)
    and role <> 'platform_admin'
    and (role <> 'branch_admin' or exists (select 1 from public.tenants t where t.id = tenant_id and t.tier = 'premium'))
    and (role <> 'leader' or exists (select 1 from public.tenants t where t.id = tenant_id and t.tier in ('standard','premium'))));
create policy "admins update accounts" on public.tenant_users for update to authenticated
  using (public.is_tenant_admin(tenant_id));
create policy "admins remove accounts" on public.tenant_users for delete to authenticated
  using (public.is_tenant_admin(tenant_id));

create policy "own platform admin row" on public.platform_admins for select to authenticated
  using (user_id = auth.uid());

create policy "levels read" on public.structure_levels for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy "levels owner write" on public.structure_levels for all to authenticated
  using (public.has_tenant_role(tenant_id, array['owner']::public.app_role[])
    and exists (select 1 from public.tenants t where t.id = tenant_id and t.tier in ('standard','premium')))
  with check (public.has_tenant_role(tenant_id, array['owner']::public.app_role[])
    and exists (select 1 from public.tenants t where t.id = tenant_id and t.tier in ('standard','premium')));

create policy "positions read" on public.positions for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy "positions admin write" on public.positions for all to authenticated
  using (public.is_tenant_admin(tenant_id))
  with check (public.is_tenant_admin(tenant_id) and public.tenant_can_write(tenant_id));

create policy "members scoped read" on public.members for select to authenticated
  using (public.can_read_member(tenant_id, branch_id, position_id));
create policy "members insert" on public.members for insert to authenticated
  with check (public.tenant_can_write(tenant_id) and (
    public.is_tenant_admin(tenant_id)
    or (public.has_tenant_role(tenant_id, array['branch_admin','usher']::public.app_role[])
        and branch_id is not distinct from public.user_branch(tenant_id))));
create policy "members update" on public.members for update to authenticated
  using (public.tenant_can_write(tenant_id) and (
    public.is_tenant_admin(tenant_id)
    or (public.has_tenant_role(tenant_id, array['branch_admin']::public.app_role[])
        and branch_id is not distinct from public.user_branch(tenant_id))));
create policy "members delete admin only" on public.members for delete to authenticated
  using (public.is_tenant_admin(tenant_id));

create policy "services read" on public.services for select to authenticated
  using (public.is_tenant_member(tenant_id));
create policy "services write" on public.services for all to authenticated
  using (public.is_tenant_admin(tenant_id)
    or (public.has_tenant_role(tenant_id, array['branch_admin']::public.app_role[])
        and branch_id is not distinct from public.user_branch(tenant_id)))
  with check (public.tenant_can_write(tenant_id) and (public.is_tenant_admin(tenant_id)
    or (public.has_tenant_role(tenant_id, array['branch_admin']::public.app_role[])
        and branch_id is not distinct from public.user_branch(tenant_id))));

create policy "attendance scoped read" on public.attendance for select to authenticated
  using (public.is_tenant_admin(tenant_id)
    or (public.has_tenant_role(tenant_id, array['branch_admin','usher']::public.app_role[])
        and branch_id is not distinct from public.user_branch(tenant_id))
    or (public.has_tenant_role(tenant_id, array['leader']::public.app_role[])
        and position_id is not null
        and exists (select 1 from public.positions p where p.id = attendance.position_id
                    and p.path <@ public.user_position_path(tenant_id))));
create policy "attendance insert" on public.attendance for insert to authenticated
  with check (public.tenant_can_write(tenant_id) and public.is_tenant_member(tenant_id));
create policy "attendance correct admin" on public.attendance for update to authenticated
  using (public.is_tenant_admin(tenant_id) and public.tenant_can_write(tenant_id));
create policy "attendance delete admin" on public.attendance for delete to authenticated
  using (public.is_tenant_admin(tenant_id) and public.tenant_can_write(tenant_id));

create policy "subscription owner read" on public.subscriptions for select to authenticated
  using (public.is_tenant_admin(tenant_id));
create policy "payments owner read" on public.payments for select to authenticated
  using (public.has_tenant_role(tenant_id, array['owner']::public.app_role[]));
create policy "imports read" on public.import_batches for select to authenticated
  using (public.is_tenant_admin(tenant_id));
create policy "imports insert" on public.import_batches for insert to authenticated
  with check (public.is_tenant_admin(tenant_id) and public.tenant_can_write(tenant_id));
create policy "audit owner read" on public.audit_events for select to authenticated
  using (public.has_tenant_role(tenant_id, array['owner']::public.app_role[]));
