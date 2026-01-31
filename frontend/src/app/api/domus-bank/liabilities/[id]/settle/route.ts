import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/http/respond";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return jsonError("Not authenticated", 401);
    }

    const { id } = await context.params;
    const { data, error } = await supabase.rpc("domus_settle_liability_by_transfer", {
      p_liability_id: id,
    });

    if (error) {
      return jsonError(error.message, 400);
    }

    return NextResponse.json(data);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
}
