-- TPS Ops database schema for Supabase (Postgres).
-- Run once in the Supabase dashboard: SQL Editor → New query → paste → Run.
--
-- Access model
--   * Anyone with a QR link (the anon key, not signed in) can read the active location list
--     and submit feedback. They cannot read audits or anyone else's feedback.
--   * Signed-in staff (customer and vendor auditors, operations team) can do everything else.
--     Turn OFF public sign-ups (Authentication → Providers → Email → "Allow new users to sign up")
--     and invite each person from Authentication → Users, so only invited people are "staff".

create extension if not exists pgcrypto;

create table if not exists public.locations (
  id          text primary key,                       -- short slug used in QR links, e.g. 'gym'
  name        text not null,
  building    text,
  categories  text[] not null default '{}',           -- custodial, housekeeping, grounds, landscaping, hvac, pm
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table if not exists public.audits (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  audit_date  date not null,
  side        text not null check (side in ('customer', 'vendor')),
  auditor     text not null,
  location_id text not null references public.locations(id),
  category    text not null check (category in ('custodial','housekeeping','grounds','landscaping','hvac','pm')),
  scores      jsonb not null,                          -- { "criterion-id": 1..5 | null (N/A) }
  comments    text
);
create index if not exists audits_date_idx on public.audits (audit_date desc);

create table if not exists public.issues (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  location_id          text not null references public.locations(id),
  category             text not null check (category in ('custodial','housekeeping','grounds','landscaping','hvac','pm')),
  rating               smallint check (rating between 1 and 5),
  comment              text check (char_length(comment) <= 2000),
  submitter            text check (char_length(submitter) <= 120),
  contact              text check (char_length(contact) <= 160),
  safety               boolean not null default false,
  source               text not null check (source in ('qr', 'audit')),
  status               text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'noted')),
  priority             text check (priority in ('high', 'medium', 'low')),
  assigned_to          text,
  resolution           text,
  resolved_at          timestamptz,
  brightly_exported_at timestamptz,
  audit_id             uuid references public.audits(id) on delete set null
);
create index if not exists issues_created_idx on public.issues (created_at desc);

alter table public.locations enable row level security;
alter table public.audits    enable row level security;
alter table public.issues    enable row level security;

-- Locations: public can see active ones (for the QR form); staff manage them.
drop policy if exists "public reads active locations" on public.locations;
create policy "public reads active locations" on public.locations
  for select to anon using (active);
drop policy if exists "staff manage locations" on public.locations;
create policy "staff manage locations" on public.locations
  for all to authenticated using (true) with check (true);

-- Audits: staff only.
drop policy if exists "staff manage audits" on public.audits;
create policy "staff manage audits" on public.audits
  for all to authenticated using (true) with check (true);

-- Issues: the public may only add new QR feedback in its initial state; staff do everything.
drop policy if exists "public submits feedback" on public.issues;
create policy "public submits feedback" on public.issues
  for insert to anon
  with check (
    source = 'qr'
    and status in ('open', 'noted')
    and assigned_to is null and resolution is null and resolved_at is null
    and brightly_exported_at is null and audit_id is null
    and exists (select 1 from public.locations l where l.id = location_id and l.active)
  );
drop policy if exists "staff manage issues" on public.issues;
create policy "staff manage issues" on public.issues
  for all to authenticated using (true) with check (true);

-- Starter locations. Edit freely here or later on the Setup screen.
insert into public.locations (id, name, building, categories) values
  ('us-main',     'Upper School Main Hall',        'Upper School',  '{custodial,housekeeping,hvac,pm}'),
  ('ms-wing',     'Middle School Wing',            'Middle School', '{custodial,housekeeping,pm}'),
  ('library',     'Library & Learning Commons',    'Library',       '{custodial,housekeeping,pm}'),
  ('dining',      'Dining Hall',                   'Student Center','{custodial,housekeeping,pm}'),
  ('gym',         'Gymnasium & Locker Rooms',      'Athletics',     '{custodial,housekeeping,hvac,pm}'),
  ('mech-a',      'Central Plant Mechanical Room', 'Central Plant', '{hvac,pm}'),
  ('fields',      'Athletic Fields & Track',       'Grounds',       '{grounds,landscaping}'),
  ('campus-core', 'Campus Quad & Entrances',       'Grounds',       '{grounds,landscaping}')
on conflict (id) do nothing;
