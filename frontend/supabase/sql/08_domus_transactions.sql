-- DOMUS PLUS - SQL 08 (TRANSACTIONS)
-- Ejecutar en Supabase SQL Editor (Database > SQL Editor)
-- Requiere 01_core.sql, 02_domus_bank.sql (ledger/accounts) y 05_domus_budgets.sql (categorías)

begin;

create extension if not exists pgcrypto;

-- Family transactions (income/expense) with category subcategory linkage.
create table if not exists public.domus_transactions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.domus_families(id) on delete cascade,
  year int not null check (year >= 2000 and year <= 2100),
  kind text not null check (kind in ('income','expense')),
  category_id uuid not null references public.domus_budget_categories(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'MXN',
  concept text not null,
  merchant text,
  occurred_at timestamptz not null default now(),
  ledger_id uuid references public.domus_ledger(id) on delete set null,
  created_by uuid references public.domus_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint domus_transactions_concept_chk check (length(trim(concept)) > 0),
  constraint domus_transactions_currency_chk check (length(trim(currency)) > 0)
);

create index if not exists domus_transactions_family_year_idx
on public.domus_transactions(family_id, year);

create index if not exists domus_transactions_family_kind_idx
on public.domus_transactions(family_id, kind);

create index if not exists domus_transactions_category_idx
on public.domus_transactions(category_id);

create index if not exists domus_transactions_occurred_at_idx
on public.domus_transactions(occurred_at desc);

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

drop trigger if exists trg_domus_transactions_touch on public.domus_transactions;
create trigger trg_domus_transactions_touch
before update on public.domus_transactions
for each row execute function public.domus_touch_updated_at();

-- RLS
alter table public.domus_transactions enable row level security;

-- Read: any member of the family.
drop policy if exists transactions_select_family on public.domus_transactions;
create policy transactions_select_family
on public.domus_transactions for select
to authenticated
using (
  exists (
    select 1 from public.domus_users u
    where u.id = auth.uid() and u.family_id = domus_transactions.family_id
  )
);

-- Write: admins only.
drop policy if exists transactions_insert_admin on public.domus_transactions;
create policy transactions_insert_admin
on public.domus_transactions for insert
to authenticated
with check (
  exists (
    select 1 from public.domus_users u
    where u.id = auth.uid()
      and u.family_id = domus_transactions.family_id
      and u.role = 'admin'
  )
);

drop policy if exists transactions_update_admin on public.domus_transactions;
create policy transactions_update_admin
on public.domus_transactions for update
to authenticated
using (
  exists (
    select 1 from public.domus_users u
    where u.id = auth.uid()
      and u.family_id = domus_transactions.family_id
      and u.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.domus_users u
    where u.id = auth.uid()
      and u.family_id = domus_transactions.family_id
      and u.role = 'admin'
  )
);

drop policy if exists transactions_delete_admin on public.domus_transactions;
create policy transactions_delete_admin
on public.domus_transactions for delete
to authenticated
using (
  exists (
    select 1 from public.domus_users u
    where u.id = auth.uid()
      and u.family_id = domus_transactions.family_id
      and u.role = 'admin'
  )
);

commit;
