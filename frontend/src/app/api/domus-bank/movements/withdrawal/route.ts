import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/http/respond";

const BodySchema = z.object({
  account_id: z.string().uuid(),
  amount: z.number().positive(),
  concept: z.string().min(1),
  category_code: z.string().optional(),
  reference_type: z.string().optional(),
  reference_id: z.string().uuid().optional(),
  related_user_id: z.string().uuid().optional(),
  evidence_url: z.string().min(1).optional(),
  receipt_id: z.string().uuid().optional(),
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

    let referenceType = body.reference_type ?? null;
    let referenceId = body.reference_id ?? null;
    let evidenceUrl = body.evidence_url ?? null;

    if (body.receipt_id) {
      const profile = await supabase
        .from("domus_users")
        .select("family_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profile.error) {
        return jsonError(profile.error.message, 400);
      }

      const familyId = profile.data?.family_id;
      if (!familyId) {
        return jsonError("Needs setup", 400);
      }

      const receipt = await supabase
        .from("domus_receipts")
        .select("id,family_id,file_path")
        .eq("id", body.receipt_id)
        .maybeSingle();

      if (receipt.error) {
        return jsonError(receipt.error.message, 400);
      }

      if (!receipt.data) {
        return jsonError("Receipt not found", 404);
      }

      if (receipt.data.family_id !== familyId) {
        return jsonError("Forbidden", 403);
      }

      referenceType = "receipt";
      referenceId = receipt.data.id;
      evidenceUrl = receipt.data.file_path;
    }

    const { data, error } = await supabase.rpc("domus_post_movement", {
      p_account_id: body.account_id,
      p_movement_type: "withdrawal",
      p_amount: body.amount,
      p_concept: body.concept,
      p_category_code: body.category_code ?? null,
      p_reference_type: referenceType,
      p_reference_id: referenceId,
      p_related_user_id: body.related_user_id ?? null,
      p_evidence_url: evidenceUrl,
    });

    if (error) {
      return jsonError(error.message, 400);
    }

    return NextResponse.json(data);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
}
