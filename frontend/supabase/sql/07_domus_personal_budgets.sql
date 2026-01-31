-- DOMUS PLUS - SQL 07 (PERSONAL BUDGETS)
-- Ejecutar en Supabase SQL Editor (Database > SQL Editor)
-- Requiere 01_core.sql (users/families) y 05_domus_budgets.sql (domus_budget_categories)

begin;

create extension if not exists pgcrypto;

-- Personal budgets per user/year/subcategory
-- NOTE: category_id must point to a subcategory (parent_id is NOT NULL). This is enforced at API level.
create table if not exists public.domus_personal_budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.domus_users(id) on delete cascade,
  family_id uuid not null references public.domus_families(id) on delete cascade,
  year int not null check (year >= 2000 and year <= 2100),
  category_id uuid not null references public.domus_budget_categories(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'MXN',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint domus_personal_budgets_currency_chk check (length(trim(currency)) > 0)
);

create unique index if not exists domus_personal_budgets_unique
on public.domus_personal_budgets(user_id, year, category_id);

create index if not exists domus_personal_budgets_family_year_idx
on public.domus_personal_budgets(family_id, year);

create index if not exists domus_personal_budgets_category_idx
on public.domus_personal_budgets(category_id);

-- updated_at trigger
create or replace function public.domus_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_domus_personal_budgets_touch on public.domus_personal_budgets;
create trigger trg_domus_personal_budgets_touch
before update on public.domus_personal_budgets
for each row execute function public.domus_touch_updated_at();

-- RLS
alter table public.domus_personal_budgets enable row level security;

-- Members can read their own personal budgets.
drop policy if exists personal_budgets_select_own on public.domus_personal_budgets;
create policy personal_budgets_select_own
on public.domus_personal_budgets for select
to authenticated
using (user_id = auth.uid());

-- Members can insert their own personal budgets (family_id must match their profile).
drop policy if exists personal_budgets_insert_own on public.domus_personal_budgets;
create policy personal_budgets_insert_own
on public.domus_personal_budgets for insert
to authenticated
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.domus_users u
    where u.id = auth.uid() and u.family_id = domus_personal_budgets.family_id
  )
);

-- Members can update their own budgets.
drop policy if exists personal_budgets_update_own on public.domus_personal_budgets;
create policy personal_budgets_update_own
on public.domus_personal_budgets for update
to authenticated
using (user_id = auth.uid())
with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.domus_users u
    where u.id = auth.uid() and u.family_id = domus_personal_budgets.family_id
  )
);

-- Members can delete their own budgets.
drop policy if exists personal_budgets_delete_own on public.domus_personal_budgets;
create policy personal_budgets_delete_own
on public.domus_personal_budgets for delete
to authenticated
using (user_id = auth.uid());

commit;
