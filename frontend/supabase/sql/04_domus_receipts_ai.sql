-- DOMUS PLUS - SQL 04 (RECIBOS - EXTRACCION CON IA)
-- Ejecutar DESPUÉS de 03_domus_receipts.sql

begin;

alter table public.domus_receipts
  add column if not exists extracted_total numeric(14,2),
  add column if not exists extracted_currency text,
  add column if not exists extracted_date date,
  add column if not exists extracted_merchant text,
  add column if not exists ai_status text not null default 'pending' check (ai_status in ('pending','done','error')),
  add column if not exists ai_extracted jsonb,
  add column if not exists ai_error text,
  add column if not exists ai_updated_at timestamptz;

commit;
