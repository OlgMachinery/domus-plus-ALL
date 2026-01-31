-- DOMUS PLUS - SQL 09 (ACTIVITY)
-- Ejecutar en Supabase SQL Editor (Database > SQL Editor)
-- Requiere 01_core.sql

begin;

create extension if not exists pgcrypto;

create table if not exists public.domus_activity_log (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.domus_families(id) on delete cascade,
  actor_id uuid references public.domus_users(id) on delete set null,
  actor_name text,
  actor_email text,
  module text not null,
  action text not null,
  entity text,
  entity_id uuid,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint domus_activity_log_module_chk check (length(trim(module)) > 0),
  constraint domus_activity_log_action_chk check (length(trim(action)) > 0),
  constraint domus_activity_log_summary_chk check (length(trim(summary)) > 0)
);

create index if not exists domus_activity_log_family_created_at_idx
on public.domus_activity_log(family_id, created_at desc);

create index if not exists domus_activity_log_family_module_idx
on public.domus_activity_log(family_id, module);

alter table public.domus_activity_log enable row level security;

-- Read: any member of the family.
drop policy if exists activity_select_family on public.domus_activity_log;
create policy activity_select_family
on public.domus_activity_log for select
to authenticated
using (
  exists (
    select 1 from public.domus_users u
    where u.id = auth.uid() and u.family_id = domus_activity_log.family_id
  )
);

-- Insert: any authenticated member can log their own events.
drop policy if exists activity_insert_self on public.domus_activity_log;
create policy activity_insert_self
on public.domus_activity_log for insert
to authenticated
with check (
  actor_id = auth.uid()
  and exists (
    select 1 from public.domus_users u
    where u.id = auth.uid() and u.family_id = domus_activity_log.family_id
  )
);

commit;
