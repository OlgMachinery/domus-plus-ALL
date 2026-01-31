-- DOMUS PLUS - SQL 03 (RECIBOS / EVIDENCIAS)
-- Ejecutar DESPUÉS de 01_core.sql
-- Nota: crea tabla + RLS y configura bucket/policies de Supabase Storage.

begin;

create extension if not exists pgcrypto;

-- Tabla: recibos/evidencias
create table if not exists public.domus_receipts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.domus_families(id) on delete cascade,
  uploaded_by uuid not null references public.domus_users(id) on delete restrict,
  created_at timestamptz not null default now(),

  receipt_date date not null default current_date,
  amount numeric(14,2),
  merchant text,
  note text,

  file_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,

  status text not null default 'active' check (status in ('active','deleted'))
);

create index if not exists domus_receipts_family_created_idx
on public.domus_receipts(family_id, created_at desc);

-- RLS
alter table public.domus_receipts enable row level security;

drop policy if exists receipts_select_member on public.domus_receipts;
create policy receipts_select_member
on public.domus_receipts for select
to authenticated
using (
  exists (
    select 1 from public.domus_users u
    where u.id = auth.uid() and u.family_id = domus_receipts.family_id
  )
);

drop policy if exists receipts_insert_member on public.domus_receipts;
create policy receipts_insert_member
on public.domus_receipts for insert
to authenticated
with check (
  uploaded_by = auth.uid()
  and exists (
    select 1 from public.domus_users u
    where u.id = auth.uid() and u.family_id = domus_receipts.family_id
  )
);

drop policy if exists receipts_update_own on public.domus_receipts;
create policy receipts_update_own
on public.domus_receipts for update
to authenticated
using (
  uploaded_by = auth.uid()
)
with check (
  uploaded_by = auth.uid()
);

-- Storage bucket (privado)
insert into storage.buckets (id, name, public)
values ('domus-receipts', 'domus-receipts', false)
on conflict (id) do nothing;

-- Storage policies (RLS en storage.objects)
-- Path esperado: family/<family_id>/<receipt_id>/<filename>

drop policy if exists "domus_receipts_storage_read" on storage.objects;
create policy "domus_receipts_storage_read"
on storage.objects for select
to authenticated
using (
  bucket_id = 'domus-receipts'
  and (storage.foldername(name))[1] = 'family'
  and (storage.foldername(name))[2] = (
    select u.family_id::text from public.domus_users u where u.id = auth.uid()
  )
);

drop policy if exists "domus_receipts_storage_insert" on storage.objects;
create policy "domus_receipts_storage_insert"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'domus-receipts'
  and (storage.foldername(name))[1] = 'family'
  and (storage.foldername(name))[2] = (
    select u.family_id::text from public.domus_users u where u.id = auth.uid()
  )
);

drop policy if exists "domus_receipts_storage_delete" on storage.objects;
create policy "domus_receipts_storage_delete"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'domus-receipts'
  and (storage.foldername(name))[1] = 'family'
  and (storage.foldername(name))[2] = (
    select u.family_id::text from public.domus_users u where u.id = auth.uid()
  )
);

commit;
