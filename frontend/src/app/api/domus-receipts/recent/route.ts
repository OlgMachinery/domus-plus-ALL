import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/http/respond";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError("Not authenticated", 401);
    }

    const profile = await supabase
      .from("domus_users")
      .select("id,family_id")
      .eq("id", user.id)
      .maybeSingle();

    if (profile.error) {
      return jsonError(profile.error.message, 400);
    }

    if (!profile.data?.family_id) {
      return jsonError("Needs setup", 400);
    }

    const url = new URL(request.url);
    const limitRaw = url.searchParams.get("limit");
    const limit = Math.max(1, Math.min(50, Number(limitRaw || "20") || 20));

    const receipts = await supabase
      .from("domus_receipts")
      .select("id,receipt_date,amount,merchant,file_name,file_path,created_at")
      .eq("family_id", profile.data.family_id)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (receipts.error) {
      return jsonError(receipts.error.message, 400);
    }

    return NextResponse.json({
      family_id: profile.data.family_id,
      items: receipts.data ?? [],
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
}
