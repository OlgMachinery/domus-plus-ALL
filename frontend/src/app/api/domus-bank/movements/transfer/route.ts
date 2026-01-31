import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/http/respond";

const BodySchema = z.object({
  from_account_id: z.string().uuid(),
  to_account_id: z.string().uuid(),
  amount: z.number().positive(),
  concept: z.string().min(1),
  reference_type: z.string().optional(),
  reference_id: z.string().uuid().optional(),
  receiver_user_id: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return jsonError("Not authenticated", 401);
    }

    const json = await request.json().catch(() => null);
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return jsonError("Invalid body", 400);
    }

    const body = parsed.data;
    const { data, error } = await supabase.rpc("domus_create_transfer", {
      p_from_account_id: body.from_account_id,
      p_to_account_id: body.to_account_id,
      p_amount: body.amount,
      p_concept: body.concept,
      p_reference_type: body.reference_type ?? null,
      p_reference_id: body.reference_id ?? null,
      p_receiver_user_id: body.receiver_user_id ?? null,
    });

    if (error) {
      return jsonError(error.message, 400);
    }

    return NextResponse.json(data);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
}
