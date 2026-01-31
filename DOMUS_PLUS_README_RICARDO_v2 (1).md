# DOMUS+ — Manual **ULTRA PASO A PASO** para Ricardo (Cursor)
**Versión:** v2.0 (incluye: qué copiar, qué pegar y qué debes ver en cada paso)  
**Para:** Persona sin conocimientos de programación  
**Herramientas:** Cursor + Supabase + Terminal  
**Objetivo:** Reconstruir el núcleo de DOMUS+ desde cero sin adivinar.

---

## Cómo usar este documento
- **No te saltes pasos.**  
- Cada sección termina con ✅ **Verificación** (lo que debes ver).  
- Si algo falla, **detente** y corrige antes de avanzar.

---

# 1) Qué es DOMUS+ (explicación simple)
DOMUS+ es un sistema para manejar finanzas familiares con reglas claras:

1) **Banco Domus (Tesorería)** = el “estado de cuenta” real (como banco).  
   - Registra depósitos y egresos con evidencia.
2) **Presupuesto (MB/PB)** = el plan (no es dinero real).
3) **Eventos / Mini‑proyectos** = agrupan gastos y comprobaciones.
4) **Consumos/Frecuencias + Forecast** = aprende de tickets y predice compras.
5) **PEPEGRILLO** = conciencia que avisa/sugiere (no ejecuta dinero).
6) **WhatsApp** (más adelante) = canal para subir tickets y confirmar “RECIBIDO”.

> **Decisión base NO negociable:**  
> ✅ 1 cuenta familiar única por familia + 1 cuenta personal por usuario.

---

# 2) Qué necesitas instalar (mínimo real)

## 2.1 Node.js (obligatorio)
Necesitas **Node.js 20 o superior**.  
Cuando esté instalado, estos comandos deben funcionar:

```bash
node -v
npm -v
```

✅ **Verificación**
- `node -v` imprime algo como `v20.x.x` o mayor  
- `npm -v` imprime un número (ej. `10.x.x`)

---

# 3) Crear el proyecto en Cursor (sin programación)

## 3.1 Crear carpeta del proyecto
1) Crea una carpeta en tu computadora llamada: `domus-plus`
2) Abre Cursor
3) Ve a **File → Open Folder…**
4) Selecciona `domus-plus`

✅ **Verificación**
- En el árbol de archivos de Cursor ves la carpeta vacía `domus-plus`

---

## 3.2 Crear la app Next.js (frontend)
En Cursor, abre la terminal:
- **Terminal → New Terminal**

Pega este comando:

```bash
npx create-next-app@latest frontend
```

Cuando pregunte, elige estas opciones (IMPORTANTE):
- TypeScript: **Yes**
- ESLint: **Yes**
- Tailwind: **Yes**
- App Router: **Yes**
- Import alias: **Yes** (deja `@/*`)

Luego:

```bash
cd frontend
npm run dev
```

Abre en tu navegador:
- http://localhost:3000

✅ **Verificación**
- Ves la página inicial de Next.js en el navegador.
- La terminal no muestra errores rojos.

> Si la terminal dice “port in use” (puerto ocupado), cierra el proceso o cambia de puerto.

---

# 4) Crear Supabase (sin programar)

## 4.1 Crear proyecto en Supabase
En Supabase Dashboard:
1) **New project**
2) Pon nombre: `domus-plus`
3) Guarda cuidadosamente estas 3 cosas:
   - **Project URL**
   - **anon public key**
   - **service_role key** (IMPORTANTE: solo server; nunca cliente)

✅ **Verificación**
- Ya puedes ver el proyecto en Supabase Dashboard.

---

## 4.2 Configurar `.env.local` en Next.js
En Cursor:
1) Abre la carpeta `frontend/`
2) Crea un archivo llamado: `frontend/.env.local`

Pega esto y reemplaza con tus valores:

```env
NEXT_PUBLIC_SUPABASE_URL=PEGA_AQUI_TU_PROJECT_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=PEGA_AQUI_TU_ANON_PUBLIC_KEY

# SERVER ONLY (NO cliente)
SUPABASE_SERVICE_ROLE_KEY=PEGA_AQUI_TU_SERVICE_ROLE_KEY

# (Luego, no necesario para el núcleo):
OPENAI_API_KEY=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_NUMBER=
```

⚠️ **Regla de seguridad crítica**
- `SUPABASE_SERVICE_ROLE_KEY` **NO** debe estar en variables `NEXT_PUBLIC_*`.

✅ **Verificación**
- El archivo existe en `frontend/.env.local`
- Reinicia el servidor local para que lea env:
  - Detén la terminal (Ctrl + C)
  - Vuelve a correr:
    ```bash
    npm run dev
    ```

---

# 5) Instalación de dependencias (copy/paste)

En la terminal dentro de `frontend/`:

```bash
npm i @supabase/ssr @supabase/supabase-js zod axios
```

✅ **Verificación**
- No hay errores de instalación.
- `node_modules/` aparece en `frontend/`

---

# 6) Crear el código base con Cursor (copiar y pegar prompts)

> Importante: en Cursor, abre el chat y pega el prompt completo.  
> Luego aplica los cambios que Cursor proponga.

---

## 6.1 PROMPT A — Config central segura
Pega este prompt en Cursor:

```text
Crea /frontend/lib/config.ts con:

- export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
- export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
- export const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

Valida:
- Si supabaseUrl o supabaseAnonKey están vacíos, lanzar Error con mensaje claro.
- NO exportes ninguna variable como NEXT_PUBLIC_* para serviceRoleKey.

Crea también /frontend/.env.example con los nombres de variables requeridas.
```

✅ **Verificación**
- Existe: `frontend/lib/config.ts`
- Existe: `frontend/.env.example`
- Reinicia `npm run dev` y no debe crashear por env faltante (si ya llenaste `.env.local`)

---

## 6.2 PROMPT B — Supabase SSR (client/server/middleware)
Pega este prompt en Cursor:

```text
Implementa Supabase SSR en Next.js:

1) Crea /frontend/lib/supabase/client.ts usando createBrowserClient de @supabase/ssr.
2) Crea /frontend/lib/supabase/server.ts exportando createClient(request?: NextRequest):
   - Si request existe, usar request.cookies.getAll() para getAll()
   - setAll() puede ser no-op (o log), porque el middleware refresca sesiones.
   - Si request no existe (Server Components), usar cookies() de next/headers y permitir setAll().

3) Crea /frontend/lib/supabase/middleware.ts con updateSession(request) usando createServerClient:
   - getAll() desde request.cookies
   - setAll() actualiza cookies en la respuesta (NextResponse)

4) Crea /frontend/middleware.ts:
   - llame updateSession(request)
   - rutas públicas: '/', '/login', '/register', '/setup'
   - para cualquier otra ruta, si no hay sesión, redirigir a '/login'

Usa supabaseUrl y supabaseAnonKey desde /frontend/lib/config.ts.
```

✅ **Verificación**
1) Reinicia:
   ```bash
   npm run dev
   ```
2) Abre en navegador:
   - http://localhost:3000/dashboard  
   Debe redirigirte a `/login` si no estás logueado.

---

## 6.3 PROMPT C — Páginas: login/register/dashboard
Pega este prompt en Cursor:

```text
Crea páginas mínimas:

- /frontend/app/page.tsx: landing con links a /login y /dashboard
- /frontend/app/login/page.tsx:
  - formulario email/password
  - usar supabase browser client (createBrowserClient ya creado)
  - al login exitoso -> router.push('/dashboard')

- /frontend/app/register/page.tsx:
  - campos: name, phone, email, password
  - usar supabase.auth.signUp({ email, password, options: { data: { name, phone } } })
  - al éxito -> router.push('/login')

- /frontend/app/dashboard/page.tsx:
  - texto simple "Dashboard"
  - link a /setup y /bank

Mantén UI simple.
```

✅ **Verificación**
- Puedes registrarte.
- Puedes iniciar sesión.
- Entrar a `/dashboard` sin errores.

> Si el registro pide confirmación por email y no quieres eso en dev:  
> En Supabase Dashboard → Auth → Providers / Email → desactiva confirmación (solo para pruebas).

---

# 7) Base de datos (SQL) — copiar/pegar EXACTO en Supabase

✅ Aquí te doy SQL real para copiar/pegar.  
No dependas de “generar” SQL con IA: cópialo tal cual.

## 7.1 Ejecutar SQL en Supabase
En Supabase Dashboard:
1) Ve a **SQL Editor**
2) Click en **New query**
3) Pega el SQL
4) Click **Run**

---

## SQL 1 — CORE + ONBOARDING OBLIGATORIO (familias, perfiles, invites, setup, RLS)

👉 Crea una query nueva y pega TODO esto:

```sql
-- ============================
-- DOMUS+ CORE + ONBOARDING v1
-- ============================

-- 1) Extensión para UUID aleatorio
create extension if not exists pgcrypto;

-- 2) Tabla familias
create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- 3) Tabla perfil de usuario (public.users) - 1:1 con auth.users
create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  phone text,
  name text,
  family_id uuid null references public.families(id) on delete set null,
  role text not null default 'member' check (role in ('admin','member')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 4) Invitaciones (admins/integrantes) para auto-asignar familia al registrarse
create table if not exists public.family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  invited_name text not null,
  invited_email text null,
  invited_phone text null,
  role text not null check (role in ('admin','member')),
  token text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  accepted_user_id uuid null references auth.users(id),
  accepted_at timestamptz null
);

create index if not exists idx_family_invites_family_id on public.family_invites(family_id);
create index if not exists idx_family_invites_email_lower on public.family_invites(lower(invited_email));
create index if not exists idx_family_invites_phone on public.family_invites(invited_phone);
create index if not exists idx_family_invites_status on public.family_invites(status);

-- 5) Helpers SECURITY DEFINER (evitan problemas con RLS)
create or replace function public.get_user_family_id(p_user_id uuid)
returns uuid
language sql
security definer
set search_path = public, auth
as $$
  select family_id from public.users where id = p_user_id;
$$;

create or replace function public.is_family_admin(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select coalesce((select (role = 'admin') and is_active from public.users where id = p_user_id), false);
$$;

-- 6) Trigger: al crear auth.users -> crear public.users
--    y si existe invitación pendiente, asigna familia y rol automáticamente.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_name text;
  v_phone text;
  v_invite public.family_invites%rowtype;
begin
  v_name := coalesce(new.raw_user_meta_data->>'name', nullif(split_part(coalesce(new.email,''), '@', 1), ''), 'User');
  v_phone := nullif(new.raw_user_meta_data->>'phone', '');

  insert into public.users (id, email, phone, name)
  values (new.id, new.email, v_phone, v_name)
  on conflict (id) do nothing;

  -- Buscar invitación pendiente por email o phone
  select *
    into v_invite
    from public.family_invites
   where status = 'pending'
     and (
       (invited_email is not null and new.email is not null and lower(invited_email) = lower(new.email))
       or
       (invited_phone is not null and v_phone is not null and invited_phone = v_phone)
     )
   order by created_at desc
   limit 1;

  if found then
    update public.users
       set family_id = v_invite.family_id,
           role = v_invite.role,
           is_active = true
     where id = new.id;

    update public.family_invites
       set status = 'accepted',
           accepted_user_id = new.id,
           accepted_at = now()
     where id = v_invite.id;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

-- 7) RPC: setup inicial obligatorio (crea familia + invita admins/integrantes)
--    p_people es un JSON array: [{ "name":"...", "email":"", "phone":"", "role":"admin|member" }, ...]
create or replace function public.domus_setup_family(
  p_family_name text,
  p_people jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_invites_count int := 0;
  v_item jsonb;
  v_name text;
  v_email text;
  v_phone text;
  v_role text;
  v_token text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_family_name is null or length(trim(p_family_name)) = 0 then
    raise exception 'Family name is required';
  end if;

  -- Evitar que un usuario cree 2 familias (MVP)
  if (select family_id from public.users where id = v_user_id) is not null then
    raise exception 'User already belongs to a family';
  end if;

  insert into public.families(name)
  values (trim(p_family_name))
  returning id into v_family_id;

  -- Convertir al usuario actual en admin de esa familia
  update public.users
     set family_id = v_family_id,
         role = 'admin',
         is_active = true
   where id = v_user_id;

  -- Crear invitaciones
  if p_people is not null then
    for v_item in select * from jsonb_array_elements(p_people)
    loop
      v_name := trim(coalesce(v_item->>'name',''));
      v_email := nullif(trim(coalesce(v_item->>'email','')), '');
      v_phone := nullif(trim(coalesce(v_item->>'phone','')), '');
      v_role := lower(trim(coalesce(v_item->>'role','member')));

      if v_name = '' then
        continue;
      end if;

      if v_role not in ('admin','member') then
        v_role := 'member';
      end if;

      v_token := encode(gen_random_bytes(16), 'hex');

      insert into public.family_invites(
        family_id, invited_name, invited_email, invited_phone, role, token, invited_by
      ) values (
        v_family_id, v_name, v_email, v_phone, v_role, v_token, v_user_id
      );

      v_invites_count := v_invites_count + 1;
    end loop;
  end if;

  return jsonb_build_object(
    'family_id', v_family_id,
    'invites_count', v_invites_count
  );
end;
$$;

-- Permitir ejecutar RPC a usuarios logueados
grant execute on function public.domus_setup_family(text, jsonb) to authenticated;

-- 8) RLS (seguridad)
alter table public.families enable row level security;
alter table public.users enable row level security;
alter table public.family_invites enable row level security;

-- Limpia policies existentes para evitar duplicados (seguro si no existen)
drop policy if exists families_select_my_family on public.families;
drop policy if exists users_select_self_or_family on public.users;
drop policy if exists invites_select_admin_only on public.family_invites;

-- Families: solo miembros de la familia pueden ver su familia
create policy families_select_my_family
on public.families
for select
to authenticated
using (id = public.get_user_family_id(auth.uid()));

-- Users: puedo verme a mí y a mi familia
create policy users_select_self_or_family
on public.users
for select
to authenticated
using (
  id = auth.uid()
  or family_id = public.get_user_family_id(auth.uid())
);

-- Invites: solo admins pueden ver invites de su familia
create policy invites_select_admin_only
on public.family_invites
for select
to authenticated
using (
  public.is_family_admin(auth.uid())
  and family_id = public.get_user_family_id(auth.uid())
);
```

✅ **Verificación (en Supabase)**
1) En **Table Editor** debes ver estas tablas:
   - `families`
   - `users`
   - `family_invites`
2) Ve a **Authentication → Users**
   - cuando registres un usuario desde tu app, debe aparecer aquí.
3) En **Table Editor → users**
   - debe existir un registro con el mismo `id` que el auth user.

---

## SQL 2 — BANCO DOMUS (tesorería, ledger, balances, transfers, pasivos)

👉 Crea una query nueva y pega TODO esto:

```sql
-- ============================
-- DOMUS+ BANCO DOMUS v1
-- ============================

create extension if not exists pgcrypto;

-- 1) Cuentas Domus (family/personal)
create table if not exists public.domus_accounts (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  account_type text not null check (account_type in ('family','personal')),
  user_id uuid null references public.users(id) on delete cascade,
  currency text not null default 'MXN',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Solo 1 cuenta familiar por familia (user_id debe ser null)
create unique index if not exists ux_domus_family_account
on public.domus_accounts(family_id)
where account_type = 'family' and user_id is null;

-- Solo 1 cuenta personal por usuario
create unique index if not exists ux_domus_personal_account
on public.domus_accounts(user_id)
where account_type = 'personal';

-- 2) Saldo actual (cache)
create table if not exists public.domus_balances (
  account_id uuid primary key references public.domus_accounts(id) on delete cascade,
  current_balance numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

-- 3) Ledger (estado de cuenta)
create table if not exists public.domus_ledger (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  account_id uuid not null references public.domus_accounts(id) on delete cascade,
  movement_type text not null check (movement_type in ('deposit','withdrawal')),
  amount numeric(12,2) not null check (amount > 0),
  balance_after numeric(12,2) not null,
  concept text not null,
  category_code text null,
  reference_type text null,
  reference_id uuid null,
  related_user_id uuid null references public.users(id) on delete set null,
  related_event_id uuid null,
  related_project_id uuid null,
  status text not null default 'posted' check (status in ('posted','reversed')),
  evidence_url text null,
  created_at timestamptz not null default now()
);

create index if not exists idx_domus_ledger_account_created
on public.domus_ledger(account_id, created_at desc);

create index if not exists idx_domus_ledger_family_created
on public.domus_ledger(family_id, created_at desc);

-- 4) Transfers (con ack)
create table if not exists public.domus_transfers (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  from_account_id uuid not null references public.domus_accounts(id) on delete cascade,
  to_account_id uuid not null references public.domus_accounts(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  concept text not null,
  reference_type text null,
  reference_id uuid null,
  status text not null default 'pending_ack' check (status in ('pending_ack','acknowledged','cancelled')),
  receiver_user_id uuid null references public.users(id) on delete set null,
  created_by uuid not null references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz null,
  ledger_withdrawal_id uuid null references public.domus_ledger(id) on delete set null,
  ledger_deposit_id uuid null references public.domus_ledger(id) on delete set null
);

create index if not exists idx_domus_transfers_family_created
on public.domus_transfers(family_id, created_at desc);

-- 5) Pasivos / saldos
create table if not exists public.domus_liabilities (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  debtor_account_id uuid not null references public.domus_accounts(id) on delete cascade,
  creditor_account_id uuid not null references public.domus_accounts(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0),
  concept text not null,
  status text not null default 'open' check (status in ('open','settled','forgiven')),
  related_ledger_id uuid null references public.domus_ledger(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz null
);

create index if not exists idx_domus_liabilities_family_status
on public.domus_liabilities(family_id, status);

-- ============================
-- RPC (SECURITY DEFINER)
-- ============================

-- A) Bootstrap: crea cuentas faltantes (personal siempre; family solo si admin)
create or replace function public.domus_bootstrap_accounts()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_family_id uuid;
  v_is_admin boolean;
  v_personal_account_id uuid;
  v_family_account_id uuid;
  v_personal_balance numeric(12,2);
  v_family_balance numeric(12,2);
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select family_id, (role = 'admin') into v_family_id, v_is_admin
  from public.users
  where id = v_user_id;

  if v_family_id is null then
    return jsonb_build_object('needs_setup', true);
  end if;

  -- Personal account
  select id into v_personal_account_id
  from public.domus_accounts
  where account_type = 'personal' and user_id = v_user_id
  limit 1;

  if v_personal_account_id is null then
    insert into public.domus_accounts (family_id, account_type, user_id)
    values (v_family_id, 'personal', v_user_id)
    returning id into v_personal_account_id;
  end if;

  insert into public.domus_balances(account_id, current_balance)
  values (v_personal_account_id, 0)
  on conflict (account_id) do nothing;

  select current_balance into v_personal_balance
  from public.domus_balances
  where account_id = v_personal_account_id;

  -- Family account (solo admin)
  if v_is_admin then
    select id into v_family_account_id
    from public.domus_accounts
    where account_type = 'family' and family_id = v_family_id and user_id is null
    limit 1;

    if v_family_account_id is null then
      insert into public.domus_accounts (family_id, account_type, user_id)
      values (v_family_id, 'family', null)
      returning id into v_family_account_id;
    end if;

    insert into public.domus_balances(account_id, current_balance)
    values (v_family_account_id, 0)
    on conflict (account_id) do nothing;

    select current_balance into v_family_balance
    from public.domus_balances
    where account_id = v_family_account_id;
  end if;

  return jsonb_build_object(
    'family_id', v_family_id,
    'is_admin', v_is_admin,
    'personal_account_id', v_personal_account_id,
    'personal_balance', coalesce(v_personal_balance, 0),
    'family_account_id', v_family_account_id,
    'family_balance', coalesce(v_family_balance, 0)
  );
end;
$$;

grant execute on function public.domus_bootstrap_accounts() to authenticated;

-- B) Post movement: deposita/retira y actualiza balance + ledger (ATÓMICO)
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
returns public.domus_ledger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_family_id uuid;
  v_is_admin boolean;
  v_account public.domus_accounts%rowtype;
  v_current_balance numeric(12,2);
  v_new_balance numeric(12,2);
  v_row public.domus_ledger%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be > 0';
  end if;

  if p_movement_type not in ('deposit','withdrawal') then
    raise exception 'Invalid movement type';
  end if;

  if p_concept is null or length(trim(p_concept)) = 0 then
    raise exception 'Concept is required';
  end if;

  select family_id, (role = 'admin') into v_user_family_id, v_is_admin
  from public.users
  where id = v_user_id;

  if v_user_family_id is null then
    raise exception 'User needs setup (no family)';
  end if;

  select * into v_account
  from public.domus_accounts
  where id = p_account_id
  limit 1;

  if not found then
    raise exception 'Account not found';
  end if;

  if v_account.family_id <> v_user_family_id then
    raise exception 'Forbidden (different family)';
  end if;

  -- Permisos:
  -- - Cuenta familiar: solo admin
  -- - Cuenta personal: dueño o admin
  if v_account.account_type = 'family' then
    if not v_is_admin then
      raise exception 'Only admin can operate family account';
    end if;
  else
    if not (v_is_admin or v_account.user_id = v_user_id) then
      raise exception 'Forbidden (not owner)';
    end if;
  end if;

  -- Lock saldo (FOR UPDATE)
  insert into public.domus_balances(account_id, current_balance)
  values (p_account_id, 0)
  on conflict (account_id) do nothing;

  select current_balance into v_current_balance
  from public.domus_balances
  where account_id = p_account_id
  for update;

  if p_movement_type = 'deposit' then
    v_new_balance := v_current_balance + p_amount;
  else
    v_new_balance := v_current_balance - p_amount;
    if v_new_balance < 0 then
      raise exception 'Insufficient funds';
    end if;
  end if;

  insert into public.domus_ledger(
    family_id, account_id, movement_type, amount, balance_after,
    concept, category_code, reference_type, reference_id,
    related_user_id, status, evidence_url
  ) values (
    v_account.family_id, p_account_id, p_movement_type, p_amount, v_new_balance,
    trim(p_concept), p_category_code, p_reference_type, p_reference_id,
    p_related_user_id, 'posted', p_evidence_url
  )
  returning * into v_row;

  update public.domus_balances
     set current_balance = v_new_balance,
         updated_at = now()
   where account_id = p_account_id;

  return v_row;
end;
$$;

grant execute on function public.domus_post_movement(uuid, text, numeric, text, text, text, uuid, uuid, text) to authenticated;

-- C) Transfer: crea 2 movimientos + registro de transfer
create or replace function public.domus_create_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_concept text,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_receiver_user_id uuid default null
)
returns public.domus_transfers
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_family_id uuid;
  v_is_admin boolean;
  v_from public.domus_accounts%rowtype;
  v_to public.domus_accounts%rowtype;
  v_w public.domus_ledger%rowtype;
  v_d public.domus_ledger%rowtype;
  v_t public.domus_transfers%rowtype;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select family_id, (role = 'admin') into v_user_family_id, v_is_admin
  from public.users where id = v_user_id;

  if v_user_family_id is null then
    raise exception 'User needs setup (no family)';
  end if;

  select * into v_from from public.domus_accounts where id = p_from_account_id;
  if not found then raise exception 'From account not found'; end if;

  select * into v_to from public.domus_accounts where id = p_to_account_id;
  if not found then raise exception 'To account not found'; end if;

  if v_from.family_id <> v_user_family_id or v_to.family_id <> v_user_family_id then
    raise exception 'Forbidden (different family)';
  end if;

  -- Permisos:
  -- - Solo admin puede transferir desde cuenta familiar
  -- - Para transferir desde cuenta personal: dueño o admin
  if v_from.account_type = 'family' then
    if not v_is_admin then raise exception 'Only admin can transfer from family account'; end if;
  else
    if not (v_is_admin or v_from.user_id = v_user_id) then raise exception 'Forbidden (not owner)'; end if;
  end if;

  -- Ejecuta movimientos atómicos
  v_w := public.domus_post_movement(p_from_account_id, 'withdrawal', p_amount, p_concept, null, p_reference_type, p_reference_id, p_receiver_user_id, null);
  v_d := public.domus_post_movement(p_to_account_id, 'deposit', p_amount, p_concept, null, p_reference_type, p_reference_id, p_receiver_user_id, null);

  insert into public.domus_transfers(
    family_id, from_account_id, to_account_id, amount, concept,
    reference_type, reference_id, status, receiver_user_id, created_by,
    ledger_withdrawal_id, ledger_deposit_id
  ) values (
    v_user_family_id, p_from_account_id, p_to_account_id, p_amount, trim(p_concept),
    p_reference_type, p_reference_id, 'pending_ack', p_receiver_user_id, v_user_id,
    v_w.id, v_d.id
  )
  returning * into v_t;

  return v_t;
end;
$$;

grant execute on function public.domus_create_transfer(uuid, uuid, numeric, text, text, uuid, uuid) to authenticated;

-- D) ACK transfer ("RECIBIDO")
create or replace function public.domus_ack_transfer(p_transfer_id uuid)
returns public.domus_transfers
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_family_id uuid;
  v_is_admin boolean;
  v_t public.domus_transfers%rowtype;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  select family_id, (role='admin') into v_user_family_id, v_is_admin
  from public.users where id=v_user_id;

  select * into v_t from public.domus_transfers where id = p_transfer_id;
  if not found then raise exception 'Transfer not found'; end if;

  if v_t.family_id <> v_user_family_id then
    raise exception 'Forbidden (different family)';
  end if;

  if not (v_is_admin or v_t.receiver_user_id = v_user_id) then
    raise exception 'Forbidden (only receiver or admin)';
  end if;

  if v_t.status <> 'pending_ack' then
    return v_t;
  end if;

  update public.domus_transfers
     set status = 'acknowledged',
         acknowledged_at = now()
   where id = p_transfer_id
   returning * into v_t;

  return v_t;
end;
$$;

grant execute on function public.domus_ack_transfer(uuid) to authenticated;

-- E) Crear pasivo (sobrante)
create or replace function public.domus_create_liability(
  p_debtor_account_id uuid,
  p_creditor_account_id uuid,
  p_amount numeric,
  p_concept text,
  p_related_ledger_id uuid default null
)
returns public.domus_liabilities
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_family_id uuid;
  v_is_admin boolean;
  v_deb public.domus_accounts%rowtype;
  v_cre public.domus_accounts%rowtype;
  v_row public.domus_liabilities%rowtype;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  select family_id, (role='admin') into v_user_family_id, v_is_admin
  from public.users where id=v_user_id;

  if p_amount is null or p_amount <= 0 then raise exception 'Amount must be > 0'; end if;

  select * into v_deb from public.domus_accounts where id=p_debtor_account_id;
  if not found then raise exception 'Debtor account not found'; end if;

  select * into v_cre from public.domus_accounts where id=p_creditor_account_id;
  if not found then raise exception 'Creditor account not found'; end if;

  if v_deb.family_id <> v_user_family_id or v_cre.family_id <> v_user_family_id then
    raise exception 'Forbidden (different family)';
  end if;

  -- Permisos:
  -- - admin puede crear cualquier pasivo de su familia
  -- - integrante solo puede crearlo si él es el deudor
  if not (v_is_admin or v_deb.user_id = v_user_id) then
    raise exception 'Forbidden (only admin or debtor)';
  end if;

  insert into public.domus_liabilities(
    family_id, debtor_account_id, creditor_account_id, amount, concept, status, related_ledger_id
  ) values (
    v_user_family_id, p_debtor_account_id, p_creditor_account_id, p_amount, trim(p_concept), 'open', p_related_ledger_id
  )
  returning * into v_row;

  return v_row;
end;
$$;

grant execute on function public.domus_create_liability(uuid, uuid, numeric, text, uuid) to authenticated;

-- F) Liquidar pasivo por transferencia
create or replace function public.domus_settle_liability_by_transfer(p_liability_id uuid)
returns public.domus_liabilities
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_family_id uuid;
  v_is_admin boolean;
  v_l public.domus_liabilities%rowtype;
  v_t public.domus_transfers%rowtype;
begin
  if v_user_id is null then raise exception 'Not authenticated'; end if;

  select family_id, (role='admin') into v_user_family_id, v_is_admin
  from public.users where id=v_user_id;

  select * into v_l from public.domus_liabilities where id=p_liability_id;
  if not found then raise exception 'Liability not found'; end if;

  if v_l.family_id <> v_user_family_id then
    raise exception 'Forbidden (different family)';
  end if;

  if v_l.status <> 'open' then
    return v_l;
  end if;

  -- MVP: solo admin liquida (se puede ampliar después)
  if not v_is_admin then
    raise exception 'Only admin can settle liabilities (MVP)';
  end if;

  v_t := public.domus_create_transfer(
    v_l.debtor_account_id,
    v_l.creditor_account_id,
    v_l.amount,
    'Liquidación pasivo: ' || v_l.concept,
    'liability',
    v_l.id,
    null
  );

  update public.domus_liabilities
     set status = 'settled',
         closed_at = now()
   where id = p_liability_id
   returning * into v_l;

  return v_l;
end;
$$;

grant execute on function public.domus_settle_liability_by_transfer(uuid) to authenticated;

-- ============================
-- RLS (solo lectura; escrituras por RPC)
-- ============================
alter table public.domus_accounts enable row level security;
alter table public.domus_balances enable row level security;
alter table public.domus_ledger enable row level security;
alter table public.domus_transfers enable row level security;
alter table public.domus_liabilities enable row level security;

drop policy if exists domus_accounts_select on public.domus_accounts;
drop policy if exists domus_balances_select on public.domus_balances;
drop policy if exists domus_ledger_select on public.domus_ledger;
drop policy if exists domus_transfers_select on public.domus_transfers;
drop policy if exists domus_liabilities_select on public.domus_liabilities;

create policy domus_accounts_select
on public.domus_accounts
for select
to authenticated
using (
  family_id = public.get_user_family_id(auth.uid())
  and (
    public.is_family_admin(auth.uid())
    or user_id = auth.uid()
  )
);

create policy domus_balances_select
on public.domus_balances
for select
to authenticated
using (
  exists (
    select 1
    from public.domus_accounts a
    where a.id = domus_balances.account_id
      and a.family_id = public.get_user_family_id(auth.uid())
      and (public.is_family_admin(auth.uid()) or a.user_id = auth.uid())
  )
);

create policy domus_ledger_select
on public.domus_ledger
for select
to authenticated
using (
  exists (
    select 1
    from public.domus_accounts a
    where a.id = domus_ledger.account_id
      and a.family_id = public.get_user_family_id(auth.uid())
      and (public.is_family_admin(auth.uid()) or a.user_id = auth.uid())
  )
);

create policy domus_transfers_select
on public.domus_transfers
for select
to authenticated
using (
  family_id = public.get_user_family_id(auth.uid())
  and (public.is_family_admin(auth.uid()) or receiver_user_id = auth.uid() or created_by = auth.uid())
);

create policy domus_liabilities_select
on public.domus_liabilities
for select
to authenticated
using (
  family_id = public.get_user_family_id(auth.uid())
  and (
    public.is_family_admin(auth.uid())
    or exists (select 1 from public.domus_accounts a where a.id = debtor_account_id and a.user_id = auth.uid())
    or exists (select 1 from public.domus_accounts a where a.id = creditor_account_id and a.user_id = auth.uid())
  )
);
```

✅ **Verificación (Supabase)**
En **Table Editor**, debes ver:
- `domus_accounts`
- `domus_balances`
- `domus_ledger`
- `domus_transfers`
- `domus_liabilities`

---

# 8) Setup obligatorio en la app (/setup) + gating

## 8.1 PROMPT D — API Setup + página /setup
Pega este prompt en Cursor:

```text
Implementa onboarding obligatorio:

1) Crea /frontend/lib/auth/requireFamily.ts (server):
- usa supabase server client
- si no hay user -> redirect('/login')
- obtiene perfil public.users del usuario
- si family_id es null -> redirect('/setup')
- retorna perfil si está ok

2) Crea API:
- /frontend/app/api/setup/status/route.ts (GET):
  - retorna { needs_setup: boolean, user: { id,email,name,phone,role,family_id } }
- /frontend/app/api/setup/family/route.ts (POST):
  - valida body con zod:
    { family_name: string, people: Array<{name:string, email?:string, phone?:string, role:'admin'|'member'}> }
  - llama supabase.rpc('domus_setup_family', { p_family_name: family_name, p_people: people })
  - retorna data

3) Crea /frontend/app/setup/page.tsx (client):
- wizard 3 pasos:
  Paso 1: nombre familia
  Paso 2: agregar admins/integrantes (lista)
  Paso 3: confirmar y enviar
- al finalizar: router.push('/dashboard')

4) En /frontend/app/dashboard/page.tsx llama requireFamily() al inicio.
```

✅ **Verificación**
- Si entras a `/dashboard` sin familia → redirige a `/setup`.
- Si creas familia → te deja entrar a `/dashboard`.

---

# 9) Banco Domus en Next.js (APIs + UI /bank)

## 9.1 PROMPT E — APIs Banco Domus
Pega este prompt en Cursor:

```text
Crea rutas API para Banco Domus:

1) GET /frontend/app/api/domus-bank/accounts/me/route.ts
- valida sesión
- llama RPC domus_bootstrap_accounts()
- retorna JSON con cuentas y balances

2) GET /frontend/app/api/domus-bank/ledger/route.ts
- query: account_id opcional, limit opcional
- si no admin: forzar account_id a su cuenta personal
- retorna items + balance actual

3) POST /frontend/app/api/domus-bank/movements/deposit/route.ts
4) POST /frontend/app/api/domus-bank/movements/withdrawal/route.ts
- valida zod
- llama domus_post_movement()

5) POST /frontend/app/api/domus-bank/movements/transfer/route.ts
- llama domus_create_transfer()

6) POST /frontend/app/api/domus-bank/transfers/[id]/ack/route.ts
- llama domus_ack_transfer()

7) POST /frontend/app/api/domus-bank/liabilities/create/route.ts
- llama domus_create_liability()

8) POST /frontend/app/api/domus-bank/liabilities/[id]/settle/route.ts
- llama domus_settle_liability_by_transfer()

Incluye un helper de respuesta de error uniforme { detail }.
```

✅ **Verificación**
Con sesión iniciada:
- `GET http://localhost:3000/api/domus-bank/accounts/me` devuelve JSON (no error).
- Si no hiciste setup: debería indicar `needs_setup`.

---

## 9.2 PROMPT F — UI /bank (mínimo) + botones de prueba
Pega este prompt en Cursor:

```text
Crea /frontend/app/bank/page.tsx (client) que:

1) Cargue GET /api/domus-bank/accounts/me y muestre:
- Saldo personal
- Si admin: saldo familiar

2) Cargue GET /api/domus-bank/ledger (para la cuenta elegida) y muestre tabla simple.

3) Agregue 2 botones SOLO PARA PRUEBA (pueden quedarse en dev):
- "Depósito de prueba +100" a la cuenta familiar (si admin) o personal (si no admin)
- "Egreso de prueba -20" de la misma cuenta

Estos botones deben llamar a:
POST /api/domus-bank/movements/deposit
POST /api/domus-bank/movements/withdrawal

Después de cada acción, recargar ledger y balance.
```

✅ **Verificación (lo que debes ver)**
- En `/bank`, al presionar “Depósito de prueba”, el saldo sube.
- Aparece una línea nueva en el ledger.
- Al presionar “Egreso de prueba”, el saldo baja.

---

# 10) Checklist de prueba final (núcleo completo)
1) Registro usuario  
2) Login  
3) `/dashboard` te manda a `/setup`  
4) En `/setup` creas familia y agregas al menos 1 integrante  
5) Vas a `/bank`  
6) Depósito de prueba  
7) Egreso de prueba  
8) (Opcional) transferencia y ack

✅ Si todo esto funciona, el núcleo está listo.

---

# 11) Lo que sigue (fase 2, cuando el núcleo esté estable)
- Eventos (viajes, reparaciones)
- Mini‑proyectos + lista inteligente
- Receipts (tickets del súper) → OCR → tabla
- Consumo/frecuencias → forecast
- PEPEGRILLO
- WhatsApp (Twilio)

---

# FIN DEL DOCUMENTO
Si algo falla, NO avances: regresa al último paso y revisa la verificación.
