-- DOMUS PLUS - SQL 01 (CORE)
-- Ejecutar en Supabase SQL Editor (Database > SQL Editor)

begin;

-- UUIDs
create extension if not exists pgcrypto;

-- Families
create table if not exists public.domus_families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- App user profiles (separado de auth.users)
create table if not exists public.domus_users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  phone text,
  name text,
  family_id uuid references public.domus_families(id) on delete set null,
  role text not null default 'member' check (role in ('admin','member')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.domus_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_domus_users_touch on public.domus_users;
create trigger trg_domus_users_touch
before update on public.domus_users
for each row execute function public.domus_touch_updated_at();

-- Auto-create user profile when someone signs up in Supabase Auth
create or replace function public.domus_handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  v_name := nullif(coalesce(new.raw_user_meta_data->>'name', ''), '');

  insert into public.domus_users (id, email, phone, name)
  values (new.id, new.email, new.phone, v_name)
  on conflict (id) do update
    set email = excluded.email,
        phone = excluded.phone,
        name = coalesce(excluded.name, public.domus_users.name);

  return new;
end;
$$;

-- Ensure the trigger exists on auth.users
DO $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'on_auth_user_created_domus'
  ) then
    create trigger on_auth_user_created_domus
    after insert on auth.users
    for each row execute function public.domus_handle_new_auth_user();
  end if;
end $$;

-- Store the people list entered during setup (no Auth creation here)
create table if not exists public.domus_family_people (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.domus_families(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  role text not null default 'member' check (role in ('admin','member')),
  created_at timestamptz not null default now()
);

-- RLS
alter table public.domus_users enable row level security;
alter table public.domus_families enable row level security;
alter table public.domus_family_people enable row level security;

drop policy if exists domus_users_select_own on public.domus_users;
create policy domus_users_select_own
on public.domus_users for select
to authenticated
using (id = auth.uid());

drop policy if exists domus_users_update_own on public.domus_users;
create policy domus_users_update_own
on public.domus_users for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- families: allow members to see their family; allow authenticated to create
drop policy if exists families_select_member on public.domus_families;
create policy families_select_member
on public.domus_families for select
to authenticated
using (
  exists (
    select 1 from public.domus_users u
    where u.id = auth.uid() and u.family_id = domus_families.id
  )
);

drop policy if exists families_insert_authenticated on public.domus_families;
create policy families_insert_authenticated
on public.domus_families for insert
to authenticated
with check (true);

-- family people: members can see rows for their family; authenticated can insert for their family
drop policy if exists family_people_select_member on public.domus_family_people;
create policy family_people_select_member
on public.domus_family_people for select
to authenticated
using (
  exists (
    select 1 from public.domus_users u
    where u.id = auth.uid() and u.family_id = domus_family_people.family_id
  )
);

drop policy if exists family_people_insert_member on public.domus_family_people;
create policy family_people_insert_member
on public.domus_family_people for insert
to authenticated
with check (
  exists (
    select 1 from public.domus_users u
    where u.id = auth.uid() and u.family_id = domus_family_people.family_id
  )
);

-- RPC: create family + assign current user + store people
create or replace function public.domus_setup_family(
  p_family_name text,
  p_people jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_family_id uuid;
  v_person jsonb;
  v_name text;
  v_email text;
  v_phone text;
  v_role text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_family_name is null or length(trim(p_family_name)) = 0 then
    raise exception 'family_name required';
  end if;

  -- ensure profile exists (in case trigger wasn't enabled before signup)
  insert into public.domus_users (id)
  values (v_user_id)
  on conflict (id) do nothing;

  insert into public.domus_families(name)
  values (trim(p_family_name))
  returning id into v_family_id;

  update public.domus_users
  set family_id = v_family_id,
      role = 'admin'
  where id = v_user_id;

  -- store people list
  if jsonb_typeof(p_people) = 'array' then
    for v_person in select * from jsonb_array_elements(p_people)
    loop
      v_name := nullif(trim(coalesce(v_person->>'name','')), '');
      if v_name is null then
        continue;
      end if;
      v_email := nullif(trim(coalesce(v_person->>'email','')), '');
      v_phone := nullif(trim(coalesce(v_person->>'phone','')), '');
      v_role := lower(nullif(trim(coalesce(v_person->>'role','member')), ''));
      if v_role not in ('admin','member') then
        v_role := 'member';
      end if;

      insert into public.domus_family_people(family_id, name, email, phone, role)
      values (v_family_id, v_name, v_email, v_phone, v_role);
    end loop;
  end if;

  return jsonb_build_object(
    'family_id', v_family_id,
    'status', 'ok'
  );
end;
$$;

commit;
