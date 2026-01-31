import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { cookies } from "next/headers";
import { getSupabaseAnonKey, getSupabaseServiceRoleKey, getSupabaseUrl } from "@/lib/config";

export default async function HomePage(props: { searchParams?: Promise<{ debug?: string; throw?: string }> }) {
  const sp = (await props.searchParams) ?? {};

  if (sp.throw === "1") {
    throw new Error("Debug: forced error at / (throw=1)");
  }

  if (sp.debug === "1") {
    const store = await cookies();
    const lang = store.get("domus_lang")?.value ?? "(none)";

    const env = {
      NEXT_PUBLIC_SUPABASE_URL: false,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: false,
      SUPABASE_SERVICE_ROLE_KEY: false,
      error: null as string | null,
    };

    try {
      env.NEXT_PUBLIC_SUPABASE_URL = Boolean(getSupabaseUrl());
      env.NEXT_PUBLIC_SUPABASE_ANON_KEY = Boolean(getSupabaseAnonKey());
      env.SUPABASE_SERVICE_ROLE_KEY = Boolean(getSupabaseServiceRoleKey());
    } catch (e) {
      env.error = e instanceof Error ? e.message : "Invalid env";
    }

    return (
      <main className="mx-auto w-full max-w-3xl p-6">
        <div className="card">
          <h1 className="text-2xl font-semibold tracking-tight">Debug (inicio)</h1>
          <p className="mt-2 text-sm muted">Modo diagnóstico activado con <span className="code">?debug=1</span>.</p>

          <div className="mt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3"><span className="muted">Node</span><span className="font-medium">{process.version}</span></div>
            <div className="flex items-center justify-between gap-3"><span className="muted">Cookie domus_lang</span><span className="font-medium">{lang}</span></div>
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

          <div className="mt-6 flex flex-wrap gap-2">
            <Link className="btn" href="/api/health" target="_blank" rel="noreferrer">Abrir /api/health</Link>
            <Link className="btn" href="/debug">Ir a /debug</Link>
            <Link className="btn" href="/?throw=1">Forzar error</Link>
            <Link className="btn btn-primary" href="/login">Login</Link>
          </div>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const profile = await supabase
    .from("domus_users")
    .select("family_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile.data?.family_id) {
    redirect("/dashboard");
  }

  redirect("/setup");
}
