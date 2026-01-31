# DOMUS PLUS

Next.js (App Router + TypeScript) en `frontend/` + base de datos en Supabase.

## 1) Variables de entorno

En [frontend/.env.local](frontend/.env.local) (no se commitea):

- `NEXT_PUBLIC_SUPABASE_URL=...`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY=...` (en Supabase suele aparecer como “publishable key”)
- `SUPABASE_SERVICE_ROLE_KEY=...` (opcional por ahora; **server-only**)

## 2) Crear la base de datos en Supabase (desde cero)

En Supabase ve a **Database → SQL Editor** y ejecuta **en este orden**:

1. [frontend/supabase/sql/01_core.sql](frontend/supabase/sql/01_core.sql)
2. [frontend/supabase/sql/02_domus_bank.sql](frontend/supabase/sql/02_domus_bank.sql)
3. [frontend/supabase/sql/03_domus_receipts.sql](frontend/supabase/sql/03_domus_receipts.sql) (si usarás recibos)
4. [frontend/supabase/sql/04_domus_receipts_ai.sql](frontend/supabase/sql/04_domus_receipts_ai.sql) (si usarás IA de recibos)
5. [frontend/supabase/sql/05_domus_budgets.sql](frontend/supabase/sql/05_domus_budgets.sql) (presupuestos)
6. [frontend/supabase/sql/06_domus_budget_subcategories.sql](frontend/supabase/sql/06_domus_budget_subcategories.sql) (subcategorías)

Eso crea:

- `public.users` (perfil de app) vinculado a `auth.users`
- Setup familiar (`domus_setup_family`)
- Banco Domus (cuentas, ledger, balances, transferencias, pasivos)
- RPCs que usa el frontend (`domus_bootstrap_accounts`, `domus_post_movement`, etc.)

Si te aparece un error tipo **"Could not find the function public.domus_*"** al usar la app, casi siempre significa que no ejecutaste los scripts donde viven esas RPC:

- `domus_setup_family` está en [frontend/supabase/sql/01_core.sql](frontend/supabase/sql/01_core.sql)
- RPCs de banco (`domus_bootstrap_accounts`, `domus_post_movement`, `domus_create_transfer`, etc.) están en [frontend/supabase/sql/02_domus_bank.sql](frontend/supabase/sql/02_domus_bank.sql)

Verificación rápida (opcional) en SQL Editor:

```sql
select proname
from pg_proc
join pg_namespace n on n.oid = pg_proc.pronamespace
where n.nspname = 'public'
	and proname in (
		'domus_setup_family',
		'domus_bootstrap_accounts',
		'domus_post_movement',
		'domus_create_transfer',
		'domus_ack_transfer',
		'domus_create_liability',
		'domus_settle_liability_by_transfer'
	)
order by proname;
```

## 3) Correr en local (Windows PowerShell)

Dev:

`Set-Location "C:\Users\THINKPAD\Documents\domus-plus\frontend"; npm.cmd run dev`

Build:

`Set-Location "C:\Users\THINKPAD\Documents\domus-plus\frontend"; npm.cmd run build`

## 4) Flujo para probar

1. Abre `http://localhost:3000`
2. `/register`
3. `/setup` (crear familia)
4. `/bank` (deposit/withdrawal de prueba)

## Seguridad

No pegues keys (OpenAI/Supabase secret) en capturas o chats. Si se filtró alguna, rótala/regenérala.
