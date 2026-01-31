import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/http/respond";

const BodySchema = z.object({
  debtor_account_id: z.string().uuid(),
  creditor_account_id: z.string().uuid(),
  amount: z.number().positive(),
  concept: z.string().min(1),
  related_ledger_id: z.string().uuid().optional(),
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
    const { data, error } = await supabase.rpc("domus_create_liability", {
      p_debtor_account_id: body.debtor_account_id,
      p_creditor_account_id: body.creditor_account_id,
      p_amount: body.amount,
      p_concept: body.concept,
      p_related_ledger_id: body.related_ledger_id ?? null,
    });

    if (error) {
      return jsonError(error.message, 400);
    }

    return NextResponse.json(data);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
}
