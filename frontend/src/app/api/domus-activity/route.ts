import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/http/respond";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  module: z.string().trim().min(1).max(40).optional(),
  action: z.string().trim().min(1).max(40).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return jsonError("Not authenticated", 401);

    const profile = await supabase
      .from("domus_users")
      .select("id,family_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profile.error) return jsonError(profile.error.message, 400);
    if (!profile.data?.family_id) return jsonError("Needs setup", 400);

    const url = new URL(request.url);
    const parsed = QuerySchema.safeParse({
      limit: url.searchParams.get("limit") ?? undefined,
      module: url.searchParams.get("module") ?? undefined,
      action: url.searchParams.get("action") ?? undefined,
    });

    if (!parsed.success) {
      return jsonError("Invalid query", 400);
    }

    let q = supabase
      .from("domus_activity_log")
      .select("id,created_at,module,action,entity,entity_id,summary,metadata,actor_id,actor_name,actor_email")
      .eq("family_id", profile.data.family_id)
      .order("created_at", { ascending: false })
      .limit(parsed.data.limit);

    if (parsed.data.module) q = q.eq("module", parsed.data.module);
    if (parsed.data.action) q = q.eq("action", parsed.data.action);

    const res = await q;

    // If SQL 09 hasn't been executed yet, keep the UI working.
    if (res.error) {
      const msg = res.error.message || "Activity unavailable";
      if (/domus_activity_log/i.test(msg) || /does not exist/i.test(msg)) {
        return NextResponse.json({ items: [], needs_sql: true });
      }
      return jsonError(msg, 400);
    }

    return NextResponse.json({ items: res.data ?? [] });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
}
