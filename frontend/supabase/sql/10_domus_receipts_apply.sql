-- DOMUS PLUS - SQL 10 (RECIBOS -> APLICAR A PRESUPUESTO)
-- Ejecutar DESPUÉS de 08_domus_transactions.sql y 04_domus_receipts_ai.sql

begin;

-- Track when a receipt has been applied to budgets (via a transaction)
alter table public.domus_receipts
  add column if not exists applied_transaction_id uuid references public.domus_transactions(id) on delete set null,
  add column if not exists applied_category_id uuid references public.domus_budget_categories(id) on delete set null,
  add column if not exists applied_amount numeric(14,2),
  add column if not exists applied_currency text,
  add column if not exists applied_at timestamptz;

create index if not exists domus_receipts_applied_tx_idx
on public.domus_receipts(applied_transaction_id);

create index if not exists domus_receipts_applied_family_at_idx
on public.domus_receipts(family_id, applied_at desc);

-- Expand update policy: allow uploader OR family admin to update (needed to mark applied)
-- NOTE: safe to re-run.
drop policy if exists receipts_update_own on public.domus_receipts;
create policy receipts_update_member_or_admin
on public.domus_receipts for update
to authenticated
using (
  uploaded_by = auth.uid()
  or exists (
    select 1 from public.domus_users u
    where u.id = auth.uid()
      and u.family_id = domus_receipts.family_id
      and u.role = 'admin'
  )
)
with check (
  uploaded_by = auth.uid()
  or exists (
    select 1 from public.domus_users u
    where u.id = auth.uid()
      and u.family_id = domus_receipts.family_id
      and u.role = 'admin'
  )
);

commit;
