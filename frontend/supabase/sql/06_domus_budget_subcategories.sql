-- DOMUS PLUS - SQL 06 (BUDGET SUBCATEGORIES)
-- Ejecutar si ya corriste 05_domus_budgets.sql
-- Inserta subcategorías globales (family_id null) debajo de categorías globales existentes.

begin;

-- Keep the catalog idempotent across re-runs.
create unique index if not exists domus_budget_categories_unique_name_per_parent
on public.domus_budget_categories(
  coalesce(family_id, '00000000-0000-0000-0000-000000000000'::uuid),
  coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
  lower(btrim(name))
);

-- Normalize a few historical names (keeps IDs stable).
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

-- Ensure parent categories exist (global)
insert into public.domus_budget_categories (family_id, parent_id, name, sort_order)
select v.family_id, v.parent_id, v.name, v.sort_order
from (
  values
    (null::uuid, null::uuid, 'Servicios Basicos', 10),
    (null::uuid, null::uuid, 'Mercado', 20),
    (null::uuid, null::uuid, 'Vivienda', 30),
    (null::uuid, null::uuid, 'Transporte', 40),
    (null::uuid, null::uuid, 'Impuestos', 50),
    (null::uuid, null::uuid, 'Educacion', 60),
    (null::uuid, null::uuid, 'Salud', 70),
    (null::uuid, null::uuid, 'Salud Medicamentos', 80),
    (null::uuid, null::uuid, 'Vida Social', 90)
) as v(family_id, parent_id, name, sort_order)
where not exists (
  select 1 from public.domus_budget_categories c
  where c.family_id is null and c.parent_id is null and lower(trim(c.name)) = lower(trim(v.name))
);

-- Insert subcategories for each parent (global)
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
where not exists (
  select 1
  from public.domus_budget_categories c
  where c.family_id is null
    and c.parent_id = p.id
    and lower(trim(c.name)) = lower(trim(s.sub_name))
);

commit;
