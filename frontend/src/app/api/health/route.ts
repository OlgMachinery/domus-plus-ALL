import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const strict = url.searchParams.get("strict") === "1";
  const checkSession = url.searchParams.get("session") === "1";

  const env = {
    NEXT_PUBLIC_SUPABASE_URL: Boolean((process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim()),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: Boolean((process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim()),
    SUPABASE_SERVICE_ROLE_KEY: Boolean((process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim()),
  };

  const response: {
    ok: boolean;
    time: string;
    node: string;
    strict: boolean;
    env: typeof env;
    supabase: {
      attempted: boolean;
      ok: boolean;
      authUser: boolean;
      error?: string;
    };
    error?: string;
  } = {
    ok: true,
    time: new Date().toISOString(),
    node: process.version,
    strict,
    env,
    supabase: {
      attempted: false,
      ok: false,
      authUser: false,
    },
  };

  try {
    const canInitSupabase = env.NEXT_PUBLIC_SUPABASE_URL && env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (canInitSupabase && checkSession) {
      response.supabase.attempted = true;
      try {
        const supabase = await createClient();
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        response.supabase.ok = true;
        response.supabase.authUser = Boolean(data.session?.user);
      } catch (e) {
        response.ok = false;
        response.supabase.error = e instanceof Error ? e.message : "Supabase error";
      }
    }

    // If critical env is missing, mark unhealthy but still return JSON.
    if (!canInitSupabase) {
      response.ok = false;
    }
  } catch (e) {
    response.ok = false;
    response.error = e instanceof Error ? e.message : "Unknown error";
  }

  return NextResponse.json(response, { status: strict && !response.ok ? 500 : 200 });
}
