export function getSupabaseUrl(): string {
  const value = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (!value) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_URL");
  return value;
}

export function getSupabaseAnonKey(): string {
  const value = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "").trim();
  if (!value) throw new Error("Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return value;
}

export function getSupabaseServiceRoleKey(): string {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
}
