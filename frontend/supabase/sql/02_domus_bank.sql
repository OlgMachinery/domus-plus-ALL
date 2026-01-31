-- DOMUS PLUS - SQL 02 (BANCO DOMUS)
-- Ejecutar DESPUÉS de 01_core.sql

begin;

create extension if not exists pgcrypto;

-- Accounts (personal + family)
create table if not exists public.domus_accounts (
  id uuid primary key default gen_random_uuid(),
  account_type text not null check (account_type in ('personal','family')),
  owner_user_id uuid references public.domus_users(id) on delete cascade,
  family_id uuid references public.domus_families(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint domus_accounts_personal_owner_chk check (
    (account_type = 'personal' and owner_user_id is not null)
    or
    (account_type = 'family' and family_id is not null)
  )
);

create unique index if not exists domus_accounts_personal_unique
on public.domus_accounts(owner_user_id)
where account_type = 'personal';

create unique index if not exists domus_accounts_family_unique
on public.domus_accounts(family_id)
where account_type = 'family';

-- Ledger
create table if not exists public.domus_ledger (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.domus_accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  movement_type text not null check (movement_type in ('deposit','withdrawal','transfer_in','transfer_out')),
  amount numeric(14,2) not null,
  balance_after numeric(14,2) not null,
  concept text not null,
  status text not null default 'posted' check (status in ('posted','pending','void')),
  category_code text,
  reference_type text,
  reference_id uuid,
  related_user_id uuid,
  evidence_url text
);

-- Balances view
create or replace view public.domus_balances as
select
  a.id as account_id,
  coalesce(sum(case when l.status = 'posted' then l.amount else 0 end), 0)::numeric(14,2) as current_balance
from public.domus_accounts a
left join public.domus_ledger l on l.account_id = a.id
group by a.id;

-- NOTE:
-- If you see Postgres error "stack depth limit exceeded" when selecting from domus_balances,
-- it is usually caused by RLS recursion (policies calling domus_can_access_account, which joins
-- domus_users, which can re-enter policies). In that case, replace the view with the SECURITY DEFINER
-- function below (and use it via RPC), or query balances with a service-role client on the server.

-- Transfers
create table if not exists public.domus_transfers (
  id uuid primary key default gen_random_uuid(),
  from_account_id uuid not null references public.domus_accounts(id) on delete cascade,
  to_account_id uuid not null references public.domus_accounts(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  concept text not null,
  status text not null default 'pending' check (status in ('pending','acked','cancelled')),
  reference_type text,
  reference_id uuid,
  receiver_user_id uuid,
  created_at timestamptz not null default now(),
  acked_at timestamptz
);

-- Liabilities
create table if not exists public.domus_liabilities (
  id uuid primary key default gen_random_uuid(),
  debtor_account_id uuid not null references public.domus_accounts(id) on delete cascade,
  creditor_account_id uuid not null references public.domus_accounts(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  concept text not null,
  status text not null default 'open' check (status in ('open','settled','void')),
  related_ledger_id uuid,
  created_at timestamptz not null default now(),
  settled_at timestamptz,
  settled_transfer_id uuid
);

-- RLS
alter table public.domus_accounts enable row level security;
alter table public.domus_ledger enable row level security;
alter table public.domus_transfers enable row level security;
alter table public.domus_liabilities enable row level security;

-- Helper: can current user access an account?
-- SECURITY DEFINER + row_security=off prevents RLS recursion when used inside policies.
create or replace function public.domus_can_access_account(p_account_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select exists (
    select 1
    from public.domus_accounts a
    join public.domus_users u on u.id = auth.uid()
    where a.id = p_account_id
      and (
        a.owner_user_id = auth.uid()
        or (u.family_id is not null and a.family_id = u.family_id)
      )
  );
$$;

-- Policies

drop policy if exists accounts_select_accessible on public.domus_accounts;
create policy accounts_select_accessible
on public.domus_accounts for select
to authenticated
using (public.domus_can_access_account(id));

drop policy if exists accounts_insert_authenticated on public.domus_accounts;
create policy accounts_insert_authenticated
on public.domus_accounts for insert
to authenticated
with check (true);


drop policy if exists ledger_select_accessible on public.domus_ledger;
create policy ledger_select_accessible
on public.domus_ledger for select
to authenticated
using (public.domus_can_access_account(account_id));

drop policy if exists ledger_insert_authenticated on public.domus_ledger;
create policy ledger_insert_authenticated
on public.domus_ledger for insert
to authenticated
with check (public.domus_can_access_account(account_id));


drop policy if exists transfers_select_accessible on public.domus_transfers;
create policy transfers_select_accessible
on public.domus_transfers for select
to authenticated
using (
  public.domus_can_access_account(from_account_id)
  or public.domus_can_access_account(to_account_id)
);

drop policy if exists transfers_insert_accessible on public.domus_transfers;
create policy transfers_insert_accessible
on public.domus_transfers for insert
to authenticated
with check (public.domus_can_access_account(from_account_id));


drop policy if exists liabilities_select_accessible on public.domus_liabilities;
create policy liabilities_select_accessible
on public.domus_liabilities for select
to authenticated
using (
  public.domus_can_access_account(debtor_account_id)
  or public.domus_can_access_account(creditor_account_id)
);

drop policy if exists liabilities_insert_accessible on public.domus_liabilities;
create policy liabilities_insert_accessible
on public.domus_liabilities for insert
to authenticated
with check (public.domus_can_access_account(debtor_account_id));

-- Helper: get posted balance
create or replace function public.domus_get_balance(p_account_id uuid)
returns numeric
language sql
stable
as $$
  select coalesce(sum(amount), 0)::numeric(14,2)
  from public.domus_ledger
  where account_id = p_account_id
    and status = 'posted';
$$;

-- Ensure accounts exist for current user
create or replace function public.domus_ensure_accounts_for_current_user()
returns table(
  personal_account_id uuid,
  family_account_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_family_id uuid;
  v_personal uuid;
  v_family uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select family_id into v_family_id
  from public.domus_users
  where id = v_user_id;

  -- personal
  select id into v_personal
  from public.domus_accounts
  where owner_user_id = v_user_id and account_type = 'personal';

  if v_personal is null then
    insert into public.domus_accounts(account_type, owner_user_id)
    values ('personal', v_user_id)
    returning id into v_personal;
  end if;

  -- family
  if v_family_id is not null then
    select id into v_family
    from public.domus_accounts
    where family_id = v_family_id and account_type = 'family';

    if v_family is null then
      insert into public.domus_accounts(account_type, family_id)
      values ('family', v_family_id)
      returning id into v_family;
    end if;
  end if;

  personal_account_id := v_personal;
  family_account_id := v_family;
  return next;
end;
$$;

-- RPC: bootstrap data for UI
create or replace function public.domus_bootstrap_accounts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_family_id uuid;
  v_role text;
  v_is_admin boolean;
  v_personal uuid;
  v_family uuid;
  v_personal_balance numeric(14,2);
  v_family_balance numeric(14,2);
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select family_id, role into v_family_id, v_role
  from public.domus_users
  where id = v_user_id;

  v_is_admin := (v_role = 'admin');

  select personal_account_id, family_account_id
  into v_personal, v_family
  from public.domus_ensure_accounts_for_current_user();

  v_personal_balance := public.domus_get_balance(v_personal);
  if v_family is not null then
    v_family_balance := public.domus_get_balance(v_family);
  else
    v_family_balance := null;
  end if;

  return jsonb_build_object(
    'needs_setup', v_family_id is null,
    'family_id', v_family_id,
    'is_admin', v_is_admin,
    'personal_account_id', v_personal,
    'personal_balance', v_personal_balance,
    'family_account_id', v_family,
    'family_balance', v_family_balance
  );
end;
$$;

-- RPC: post deposit/withdrawal
create or replace function public.domus_post_movement(
  p_account_id uuid,
  p_movement_type text,
  p_amount numeric,
  p_concept text,
  p_category_code text default null,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_related_user_id uuid default null,
  p_evidence_url text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_signed_amount numeric(14,2);
  v_balance_after numeric(14,2);
  v_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.domus_can_access_account(p_account_id) then
    raise exception 'Forbidden';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be > 0';
  end if;

  if p_concept is null or length(trim(p_concept)) = 0 then
    raise exception 'concept required';
  end if;

  if p_movement_type not in ('deposit','withdrawal') then
    raise exception 'movement_type must be deposit|withdrawal';
  end if;

  v_signed_amount := case when p_movement_type = 'withdrawal' then -p_amount else p_amount end;
  v_balance_after := public.domus_get_balance(p_account_id) + v_signed_amount;

  insert into public.domus_ledger(
    account_id,
    movement_type,
    amount,
    balance_after,
    concept,
    status,
    category_code,
    reference_type,
    reference_id,
    related_user_id,
    evidence_url
  ) values (
    p_account_id,
    p_movement_type,
    v_signed_amount,
    v_balance_after,
    trim(p_concept),
    'posted',
    p_category_code,
    p_reference_type,
    p_reference_id,
    p_related_user_id,
    p_evidence_url
  ) returning id into v_id;

  return jsonb_build_object('ledger_id', v_id, 'balance_after', v_balance_after);
end;
$$;

-- RPC: create transfer (pending)
create or replace function public.domus_create_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_concept text,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_receiver_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.domus_can_access_account(p_from_account_id) then
    raise exception 'Forbidden';
  end if;

  if p_from_account_id = p_to_account_id then
    raise exception 'from/to cannot be same';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be > 0';
  end if;

  if p_concept is null or length(trim(p_concept)) = 0 then
    raise exception 'concept required';
  end if;

  insert into public.domus_transfers(
    from_account_id,
    to_account_id,
    amount,
    concept,
    status,
    reference_type,
    reference_id,
    receiver_user_id
  ) values (
    p_from_account_id,
    p_to_account_id,
    p_amount,
    trim(p_concept),
    'pending',
    p_reference_type,
    p_reference_id,
    p_receiver_user_id
  ) returning id into v_id;

  return jsonb_build_object('transfer_id', v_id, 'status', 'pending');
end;
$$;

-- RPC: acknowledge transfer (posts ledger entries)
create or replace function public.domus_ack_transfer(
  p_transfer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_from uuid;
  v_to uuid;
  v_amount numeric(14,2);
  v_concept text;
  v_status text;
  v_debit_balance numeric(14,2);
  v_credit_balance numeric(14,2);
  v_debit_ledger_id uuid;
  v_credit_ledger_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select from_account_id, to_account_id, amount, concept, status
  into v_from, v_to, v_amount, v_concept, v_status
  from public.domus_transfers
  where id = p_transfer_id;

  if v_from is null then
    raise exception 'transfer not found';
  end if;

  if v_status <> 'pending' then
    return jsonb_build_object('transfer_id', p_transfer_id, 'status', v_status);
  end if;

  if not public.domus_can_access_account(v_from) then
    raise exception 'Forbidden';
  end if;

  -- debit
  v_debit_balance := public.domus_get_balance(v_from) - v_amount;
  insert into public.domus_ledger(account_id, movement_type, amount, balance_after, concept, status)
  values (v_from, 'transfer_out', -v_amount, v_debit_balance, v_concept, 'posted')
  returning id into v_debit_ledger_id;

  -- credit
  v_credit_balance := public.domus_get_balance(v_to) + v_amount;
  insert into public.domus_ledger(account_id, movement_type, amount, balance_after, concept, status)
  values (v_to, 'transfer_in', v_amount, v_credit_balance, v_concept, 'posted')
  returning id into v_credit_ledger_id;

  update public.domus_transfers
  set status = 'acked', acked_at = now()
  where id = p_transfer_id;

  return jsonb_build_object(
    'transfer_id', p_transfer_id,
    'status', 'acked',
    'debit_ledger_id', v_debit_ledger_id,
    'credit_ledger_id', v_credit_ledger_id
  );
end;
$$;

-- RPC: create liability
create or replace function public.domus_create_liability(
  p_debtor_account_id uuid,
  p_creditor_account_id uuid,
  p_amount numeric,
  p_concept text,
  p_related_ledger_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if not public.domus_can_access_account(p_debtor_account_id) then
    raise exception 'Forbidden';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be > 0';
  end if;

  if p_concept is null or length(trim(p_concept)) = 0 then
    raise exception 'concept required';
  end if;

  insert into public.domus_liabilities(
    debtor_account_id,
    creditor_account_id,
    amount,
    concept,
    status,
    related_ledger_id
  ) values (
    p_debtor_account_id,
    p_creditor_account_id,
    p_amount,
    trim(p_concept),
    'open',
    p_related_ledger_id
  ) returning id into v_id;

  return jsonb_build_object('liability_id', v_id, 'status', 'open');
end;
$$;

-- RPC: settle liability by creating + acking a transfer
create or replace function public.domus_settle_liability_by_transfer(
  p_liability_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_debtor uuid;
  v_creditor uuid;
  v_amount numeric(14,2);
  v_concept text;
  v_status text;
  v_transfer_id uuid;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select debtor_account_id, creditor_account_id, amount, concept, status
  into v_debtor, v_creditor, v_amount, v_concept, v_status
  from public.domus_liabilities
  where id = p_liability_id;

  if v_debtor is null then
    raise exception 'liability not found';
  end if;

  if v_status <> 'open' then
    return jsonb_build_object('liability_id', p_liability_id, 'status', v_status);
  end if;

  if not public.domus_can_access_account(v_debtor) then
    raise exception 'Forbidden';
  end if;

  -- create transfer
  select (public.domus_create_transfer(v_debtor, v_creditor, v_amount, 'Settlement: ' || v_concept)->>'transfer_id')::uuid
  into v_transfer_id;

  perform public.domus_ack_transfer(v_transfer_id);

  update public.domus_liabilities
  set status = 'settled',
      settled_at = now(),
      settled_transfer_id = v_transfer_id
  where id = p_liability_id;

  return jsonb_build_object('liability_id', p_liability_id, 'status', 'settled', 'transfer_id', v_transfer_id);
end;
$$;

commit;
