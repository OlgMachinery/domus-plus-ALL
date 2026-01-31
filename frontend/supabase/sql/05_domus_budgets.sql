-- DOMUS PLUS - SQL 05 (BUDGETS)
-- Ejecutar en Supabase SQL Editor (Database > SQL Editor)
-- Requiere 01_core.sql

begin;

create extension if not exists pgcrypto;

-- Catalog categories (global predefined when family_id is null; custom per family)
create table if not exists public.domus_budget_categories (
  id uuid primary key default gen_random_uuid(),
  family_id uuid references public.domus_families(id) on delete cascade,
  parent_id uuid references public.domus_budget_categories(id) on delete cascade,
  name text not null,
  sort_order int,
  created_by uuid references public.domus_users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint domus_budget_categories_name_chk check (length(trim(name)) > 0)
);

create index if not exists domus_budget_categories_family_idx
on public.domus_budget_categories(family_id);

create index if not exists domus_budget_categories_parent_idx
on public.domus_budget_categories(parent_id);

-- Prevent duplicates per (family, parent, name). Use coalesce so global rows (family_id null)
-- can still participate in uniqueness checks.
create unique index if not exists domus_budget_categories_unique_name_per_parent
on public.domus_budget_categories(
  coalesce(family_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(btrim(name))
);

-- Annual budgets per category
create table if not exists public.domus_annual_budgets (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.domus_families(id) on delete cascade,
  year int not null check (year >= 2000 and year <= 2100),
  category_id uuid not null references public.domus_budget_categories(id) on delete restrict,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'MXN',
  created_by uuid references public.domus_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint domus_annual_budgets_currency_chk check (length(trim(currency)) > 0)
);

-- Migration safety: older installs allowed amount = 0 via a CHECK constraint.
-- When re-running this script, ensure the stricter rule (amount > 0) is enforced.
-- If there are existing rows with 0, adjust them before applying the new constraint.
update public.domus_annual_budgets
set amount = 0.01
where amount = 0;

do $$
begin
  -- Default Postgres name for the old inline CHECK is usually domus_annual_budgets_amount_check
  alter table public.domus_annual_budgets drop constraint if exists domus_annual_budgets_amount_check;
  alter table public.domus_annual_budgets drop constraint if exists domus_annual_budgets_amount_chk;
  alter table public.domus_annual_budgets add constraint domus_annual_budgets_amount_chk check (amount > 0);
exception when others then
  -- If the table doesn't exist yet or constraints are already correct, let the script continue.
  null;
end;
$$;

create unique index if not exists domus_annual_budgets_unique
on public.domus_annual_budgets(family_id, year, category_id);

create or replace function public.domus_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_domus_annual_budgets_touch on public.domus_annual_budgets;
create trigger trg_domus_annual_budgets_touch
before update on public.domus_annual_budgets
for each row execute function public.domus_touch_updated_at();

-- RLS
alter table public.domus_budget_categories enable row level security;
alter table public.domus_annual_budgets enable row level security;

-- Categories: anyone in family can read (plus global predefined)
drop policy if exists budget_categories_select on public.domus_budget_categories;
create policy budget_categories_select
on public.domus_budget_categories for select
to authenticated
using (
  family_id is null
  or exists (
    select 1 from public.domus_users u
    where u.id = auth.uid() and u.family_id = domus_budget_categories.family_id
  )
);

-- Categories: admin can create custom categories for their family
-- (predefined ones should be inserted by admin/service in SQL)
drop policy if exists budget_categories_insert_admin on public.domus_budget_categories;
create policy budget_categories_insert_admin
on public.domus_budget_categories for insert
to authenticated
with check (
  family_id is not null
  and exists (
    select 1 from public.domus_users u
    where u.id = auth.uid()
      and u.family_id = domus_budget_categories.family_id
      and u.role = 'admin'
  )
);

drop policy if exists budget_categories_update_admin on public.domus_budget_categories;
create policy budget_categories_update_admin
on public.domus_budget_categories for update
to authenticated
using (
  family_id is not null
  and exists (
    select 1 from public.domus_users u
    where u.id = auth.uid()
      and u.family_id = domus_budget_categories.family_id
      and u.role = 'admin'
  )
)
with check (
  family_id is not null
  and exists (
    select 1 from public.domus_users u
    where u.id = auth.uid()
      and u.family_id = domus_budget_categories.family_id
      and u.role = 'admin'
  )
);

drop policy if exists budget_categories_delete_admin on public.domus_budget_categories;
create policy budget_categories_delete_admin
on public.domus_budget_categories for delete
to authenticated
using (
  family_id is not null
  and exists (
    select 1 from public.domus_users u
    where u.id = auth.uid()
      and u.family_id = domus_budget_categories.family_id
      and u.role = 'admin'
  )
);

-- Annual budgets: family can read
drop policy if exists annual_budgets_select on public.domus_annual_budgets;
create policy annual_budgets_select
on public.domus_annual_budgets for select
to authenticated
using (
  exists (
    select 1 from public.domus_users u
    where u.id = auth.uid() and u.family_id = domus_annual_budgets.family_id
  )
);

-- Annual budgets: admin can create/update/delete
drop policy if exists annual_budgets_insert_admin on public.domus_annual_budgets;
create policy annual_budgets_insert_admin
on public.domus_annual_budgets for insert
to authenticated
with check (
  exists (
    select 1 from public.domus_users u
    where u.id = auth.uid()
      and u.family_id = domus_annual_budgets.family_id
      and u.role = 'admin'
  )
);

drop policy if exists annual_budgets_update_admin on public.domus_annual_budgets;
create policy annual_budgets_update_admin
on public.domus_annual_budgets for update
to authenticated
using (
  exists (
    select 1 from public.domus_users u
    where u.id = auth.uid()
      and u.family_id = domus_annual_budgets.family_id
      and u.role = 'admin'
  )
)
with check (
  exists (
    select 1 from public.domus_users u
    where u.id = auth.uid()
      and u.family_id = domus_annual_budgets.family_id
      and u.role = 'admin'
  )
);

drop policy if exists annual_budgets_delete_admin on public.domus_annual_budgets;
create policy annual_budgets_delete_admin
on public.domus_annual_budgets for delete
to authenticated
using (
  exists (
    select 1 from public.domus_users u
    where u.id = auth.uid()
      and u.family_id = domus_annual_budgets.family_id
      and u.role = 'admin'
  )
);

-- Normalize a few historical names in the global catalog (keeps IDs stable).
update public.domus_budget_categories
set name = 'Servicios Basicos'
where family_id is null and parent_id is null and name = 'Servicios Básicos';

update public.domus_budget_categories
set name = 'Educacion'
where family_id is null and parent_id is null and name = 'Educación';

with p as (
  select id
  from public.domus_budget_categories
  where family_id is null and parent_id is null and name = 'Servicios Basicos'
  limit 1
)
update public.domus_budget_categories c
set name = 'Electricidad CFE', sort_order = 10
from p
where c.family_id is null and c.parent_id = p.id and c.name = 'Luz';

with p as (
  select id
  from public.domus_budget_categories
  where family_id is null and parent_id is null and name = 'Servicios Basicos'
  limit 1
)
update public.domus_budget_categories c
set name = 'Agua Potable', sort_order = 20
from p
where c.family_id is null and c.parent_id = p.id and c.name = 'Agua';

with p as (
  select id
  from public.domus_budget_categories
  where family_id is null and parent_id is null and name = 'Mercado'
  limit 1
)
update public.domus_budget_categories c
set name = 'Mercado General', sort_order = 10
from p
where c.family_id is null and c.parent_id = p.id and c.name = 'Groceries';

with p as (
  select id
  from public.domus_budget_categories
  where family_id is null and parent_id is null and name = 'Transporte'
  limit 1
)
update public.domus_budget_categories c
set name = 'Gasolina', sort_order = 10
from p
where c.family_id is null and c.parent_id = p.id and c.name = 'Gas';

with p as (
  select id
  from public.domus_budget_categories
  where family_id is null and parent_id is null and name = 'Educacion'
  limit 1
)
update public.domus_budget_categories c
set name = 'Colegiaturas', sort_order = 10
from p
where c.family_id is null and c.parent_id = p.id and c.name = 'Colegiatura';

with p as (
  select id
  from public.domus_budget_categories
  where family_id is null and parent_id is null and name = 'Salud'
  limit 1
)
update public.domus_budget_categories c
set name = 'Consulta', sort_order = 10
from p
where c.family_id is null and c.parent_id = p.id and c.name = 'Consultas';

with p as (
  select id
  from public.domus_budget_categories
  where family_id is null and parent_id is null and name = 'Salud'
  limit 1
)
update public.domus_budget_categories c
set name = 'Seguro Medico', sort_order = 30
from p
where c.family_id is null and c.parent_id = p.id and c.name = 'Seguro';

-- Optional cleanup: remove deprecated global subcategories if they are not referenced by budgets.
-- This avoids showing old options in the UI while keeping referential integrity.
delete from public.domus_budget_categories c
where c.family_id is null
  and c.parent_id is not null
  and lower(btrim(c.name)) in (
    'tenencia',
    'transporte público',
    'renta/hipoteca',
    'mantenimiento',
    'materiales',
    'streaming',
    'restaurantes',
    'medicinas'
  )
  and not exists (
    select 1 from public.domus_annual_budgets b
    where b.category_id = c.id
  );

-- Seed a predefined catalog (global) with subcategories
-- Parents
insert into public.domus_budget_categories (family_id, parent_id, name, sort_order)
values
  (null, null, 'Servicios Basicos', 10),
  (null, null, 'Mercado', 20),
  (null, null, 'Vivienda', 30),
  (null, null, 'Transporte', 40),
  (null, null, 'Impuestos', 50),
  (null, null, 'Educacion', 60),
  (null, null, 'Salud', 70),
  (null, null, 'Salud Medicamentos', 80),
  (null, null, 'Vida Social', 90)
on conflict do nothing;

-- Children (subcategories)
with parents as (
  select id, name
  from public.domus_budget_categories
  where family_id is null and parent_id is null
)
insert into public.domus_budget_categories (family_id, parent_id, name, sort_order)
select
  null::uuid as family_id,
  p.id as parent_id,
  s.sub_name as name,
  s.sort_order as sort_order
from parents p
join (
  values
    ('Servicios Basicos', 'Electricidad CFE', 10),
    ('Servicios Basicos', 'Agua Potable', 20),
    ('Servicios Basicos', 'Gas LP', 30),
    ('Servicios Basicos', 'Internet', 40),
    ('Servicios Basicos', 'Entretenimiento', 50),
    ('Servicios Basicos', 'Garrafones Agua', 60),
    ('Servicios Basicos', 'Telcel', 70),

    ('Mercado', 'Mercado General', 10),

    ('Vivienda', 'Cuotas Olinala', 10),
    ('Vivienda', 'Seguro Vivienda', 20),
    ('Vivienda', 'Mejoras y Remodelaciones', 30),

    ('Transporte', 'Gasolina', 10),
    ('Transporte', 'Mantenimiento coches', 20),
    ('Transporte', 'Seguros y Derechos', 30),
    ('Transporte', 'Lavado', 40),
    ('Transporte', 'LX600', 50),
    ('Transporte', 'BMW', 60),
    ('Transporte', 'HONDA CIVIC', 70),
    ('Transporte', 'LAND CRUISER', 80),

    ('Impuestos', 'Predial', 10),

    ('Educacion', 'Colegiaturas', 10),
    ('Educacion', 'Gonzalo', 20),
    ('Educacion', 'Sebastian', 30),
    ('Educacion', 'Emiliano', 40),
    ('Educacion', 'Isabela', 50),
    ('Educacion', 'Santiago', 60),
    ('Educacion', 'Enrique', 70),

    ('Salud', 'Consulta', 10),
    ('Salud', 'Medicamentos', 20),
    ('Salud', 'Seguro Medico', 30),
    ('Salud', 'Prevencion', 40),

    ('Salud Medicamentos', 'Gonzalo Jr Vuminix, Medikinet', 10),
    ('Salud Medicamentos', 'Isabela Luvox, Risperdal', 20),
    ('Salud Medicamentos', 'Gonzalo MF, Lexapro, Concerta, Efexxor', 30),
    ('Salud Medicamentos', 'Sebastian MB, Concerta', 40),
    ('Salud Medicamentos', 'Emiliano MB, Concerta, Vuminix', 50),

    ('Vida Social', 'Salidas Personales', 10),
    ('Vida Social', 'Salidas Familiares', 20),
    ('Vida Social', 'Cumpleanos', 30),
    ('Vida Social', 'Aniversarios', 40),
    ('Vida Social', 'Regalos Navidad', 50),
    ('Vida Social', 'Salidas Gonzalo', 60),
    ('Vida Social', 'Salidas Emiliano', 70),
    ('Vida Social', 'Salidas Sebastian', 80),
    ('Vida Social', 'Semana Isabela', 90),
    ('Vida Social', 'Semana Santiago', 100)
) as s(parent_name, sub_name, sort_order)
  on s.parent_name = p.name
on conflict do nothing;

commit;
