import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/config";

type CreateClientOptions = {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

export function createClient(options: CreateClientOptions = {}) {
  const supabaseUrl = options.supabaseUrl ?? getSupabaseUrl();
  const supabaseAnonKey = options.supabaseAnonKey ?? getSupabaseAnonKey();
  return createBrowserClient(supabaseUrl, supabaseAnonKey);
}
