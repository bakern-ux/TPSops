-- TPS Ops: people, sides and access levels.
-- Run after schema.sql (Supabase → SQL Editor → New query → paste → Run). Safe to run more than once.
--
-- Every signed-in person gets a profile:
--   side    'customer' or 'vendor'. Vendors can only rate as vendor; customers start on customer.
--   access  'ops'      full app: dashboard, audit log, issues, QR codes, setup
--           'auditor'  New audit only. They cannot read audits, issues or anyone's profile.
-- New accounts start as customer + auditor (the least access). The ops team changes this
-- on the Setup screen, under People.

create table if not exists public.profiles (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  full_name  text not null default '',
  side       text not null default 'customer' check (side in ('customer', 'vendor')),
  access     text not null default 'auditor' check (access in ('ops', 'auditor')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
grant select, update on public.profiles to authenticated;

-- Helpers used by the security rules. SECURITY DEFINER lets them read profiles without
-- recursion through profiles' own rules.
create or replace function public.is_ops() returns boolean
  language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.profiles where user_id = auth.uid() and access = 'ops') $$;

create or replace function public.my_side() returns text
  language sql stable security definer set search_path = public as
$$ select side from public.profiles where user_id = auth.uid() $$;

-- Lets anyone set their own display name, and nothing else about their profile.
create or replace function public.set_my_name(new_name text) returns void
  language sql volatile security definer set search_path = public as
$$ update public.profiles set full_name = left(trim(new_name), 120) where user_id = auth.uid() $$;
grant execute on function public.is_ops(), public.my_side(), public.set_my_name(text) to authenticated;

-- Create a profile automatically whenever someone is added under Authentication → Users.
create or replace function public.handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as
$$
begin
  insert into public.profiles (user_id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (user_id) do nothing;
  return new;
end
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profiles for people who already have accounts.
insert into public.profiles (user_id, email)
  select id, email from auth.users
  on conflict (user_id) do nothing;

-- Profiles: you can see your own; the ops team sees and edits everyone's.
drop policy if exists "read own or ops reads all" on public.profiles;
create policy "read own or ops reads all" on public.profiles
  for select to authenticated using (user_id = auth.uid() or public.is_ops());
drop policy if exists "ops edits profiles" on public.profiles;
create policy "ops edits profiles" on public.profiles
  for update to authenticated using (public.is_ops()) with check (public.is_ops());

-- Locations: every signed-in person can read them; only ops changes them.
drop policy if exists "staff manage locations" on public.locations;
drop policy if exists "signed-in reads locations" on public.locations;
create policy "signed-in reads locations" on public.locations
  for select to authenticated using (true);
drop policy if exists "ops manages locations" on public.locations;
create policy "ops manages locations" on public.locations
  for all to authenticated using (public.is_ops()) with check (public.is_ops());

-- Audits: ops does everything. Anyone signed in may add an audit as themselves
-- (vendors only as vendor) and read back only their own.
drop policy if exists "staff manage audits" on public.audits;
drop policy if exists "ops manages audits" on public.audits;
create policy "ops manages audits" on public.audits
  for all to authenticated using (public.is_ops()) with check (public.is_ops());
drop policy if exists "auditors add audits" on public.audits;
create policy "auditors add audits" on public.audits
  for insert to authenticated
  with check (created_by = auth.uid() and (side = 'vendor' or public.my_side() = 'customer'));
drop policy if exists "auditors read own audits" on public.audits;
create policy "auditors read own audits" on public.audits
  for select to authenticated using (created_by = auth.uid());

-- Issues: ops does everything. QR feedback (anyone) and audit-flagged issues (signed in)
-- may only be added in their starting state.
drop policy if exists "staff manage issues" on public.issues;
drop policy if exists "ops manages issues" on public.issues;
create policy "ops manages issues" on public.issues
  for all to authenticated using (public.is_ops()) with check (public.is_ops());
drop policy if exists "public submits feedback" on public.issues;
create policy "public submits feedback" on public.issues
  for insert to anon, authenticated
  with check (
    (source = 'qr' or (source = 'audit' and auth.uid() is not null))
    and status in ('open', 'noted')
    and assigned_to is null and resolution is null and resolved_at is null
    and brightly_exported_at is null
    and exists (select 1 from public.locations l where l.id = location_id and l.active)
  );

-- Last step, run separately with YOUR email to give yourself full access:
--   update public.profiles set access = 'ops' where email = 'you@example.org';
