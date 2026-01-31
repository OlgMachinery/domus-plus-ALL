import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/config";

type CookieToSet = {
  name: string;
  value: string;
  options: Record<string, unknown>;
};

export async function createClient(request?: NextRequest) {
  const supabaseUrl = getSupabaseUrl();
  const supabaseAnonKey = getSupabaseAnonKey();

  if (request) {
    return createServerClient(supabaseUrl, supabaseAnonKey, {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(_cookiesToSet: CookieToSet[]) {
          // No-op: el middleware refresca la sesión y setea cookies.
        },
      },
    });
  }

  const cookieStore = await cookies();
  const writableCookieStore = cookieStore as unknown as {
    set?: (name: string, value: string, options: Record<string, unknown>) => void;
  };

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        if (typeof writableCookieStore.set !== "function") return;
        cookiesToSet.forEach(({ name, value, options }) => {
          writableCookieStore.set?.(name, value, options);
        });
      },
    },
  });
}
