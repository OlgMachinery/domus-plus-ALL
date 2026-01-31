import Link from "next/link";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/config";

export const dynamic = "force-dynamic";

function safeBool(value: unknown): boolean {
  return Boolean(value);
}

export default async function DebugPage() {
  const store = await cookies();
  const lang = store.get("domus_lang")?.value ?? "(none)";

  const env = {
    NEXT_PUBLIC_SUPABASE_URL: false,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: false,
    SUPABASE_SERVICE_ROLE_KEY: false,
    error: null as string | null,
  };

  try {
    env.NEXT_PUBLIC_SUPABASE_URL = safeBool(getSupabaseUrl());
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY = safeBool(getSupabaseAnonKey());
    env.SUPABASE_SERVICE_ROLE_KEY = safeBool(getSupabaseServiceRoleKey());
  } catch (e) {
    env.error = e instanceof Error ? e.message : "Invalid env";
  }

  let userInfo: { ok: boolean; userId?: string; error?: string } = { ok: false };
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getUser();
    if (error) throw error;
    userInfo = { ok: true, userId: data.user?.id };
  } catch (e) {
    userInfo = { ok: false, error: e instanceof Error ? e.message : "Supabase error" };
  }

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <div className="card">
        <h1 className="text-2xl font-semibold tracking-tight">Debug</h1>
        <p className="mt-2 text-sm muted">Información segura para diagnosticar carga en VPS.</p>

        <div className="mt-4 space-y-2 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="muted">Node</span>
            <span className="font-medium">{process.version}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="muted">Cookie domus_lang</span>
            <span className="font-medium">{lang}</span>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-base font-semibold">Env</div>
          {env.error ? <div className="mt-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">{env.error}</div> : null}
          <div className="mt-2 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3"><span className="muted">NEXT_PUBLIC_SUPABASE_URL</span><span className="font-medium">{env.NEXT_PUBLIC_SUPABASE_URL ? "OK" : "MISSING"}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="muted">NEXT_PUBLIC_SUPABASE_ANON_KEY</span><span className="font-medium">{env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? "OK" : "MISSING"}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="muted">SUPABASE_SERVICE_ROLE_KEY</span><span className="font-medium">{env.SUPABASE_SERVICE_ROLE_KEY ? "OK" : "(optional)"}</span></div>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-base font-semibold">Supabase</div>
          {!userInfo.ok ? (
            <div className="mt-2 rounded-md border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-900">
              No se pudo validar sesión/cliente: {userInfo.error ?? "(sin detalle)"}
            </div>
          ) : (
            <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
              Cliente OK. user_id: {userInfo.userId ?? "(no session)"}
            </div>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <Link className="btn" href="/api/health" target="_blank" rel="noreferrer">
            Abrir /api/health
          </Link>
          <Link className="btn" href="/?throw=1">
            Forzar error en inicio
          </Link>
          <Link className="btn" href="/">
            Ir a inicio
          </Link>
        </div>
      </div>
    </main>
  );
}
