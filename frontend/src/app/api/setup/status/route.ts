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

    const { data, error } = await supabase
      .from("domus_users")
      .select("id,email,phone,name,family_id,role")
      .eq("id", user.id)
      .single();

    if (error) {
      return jsonError(error.message, 400);
    }

    return NextResponse.json({
      needs_setup: !data?.family_id,
      user: data,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
}
