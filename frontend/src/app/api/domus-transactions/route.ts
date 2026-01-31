import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/http/respond";
import { logActivity } from "@/lib/activity/log";

const CreateTransactionSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  kind: z.enum(["income", "expense"]),
  category_id: z.string().uuid(),
  amount: z.number().gt(0, "El monto debe ser mayor a 0"),
  currency: z.string().trim().min(1).max(8).default("MXN"),
  concept: z.string().trim().min(1, "La descripción es requerida"),
  merchant: z.string().trim().optional().or(z.literal("")),
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
    const yearRaw = url.searchParams.get("year");
    const kindRaw = url.searchParams.get("kind");

    const year = Number(yearRaw || new Date().getFullYear());
    const kind = kindRaw === "income" || kindRaw === "expense" ? kindRaw : null;

    let q = supabase
      .from("domus_transactions")
      .select("id,year,kind,amount,currency,category_id,concept,merchant,occurred_at")
      .eq("family_id", profile.data.family_id)
      .eq("year", year)
      .order("occurred_at", { ascending: false });

    if (kind) q = q.eq("kind", kind);

    const res = await q;
    if (res.error) return jsonError(res.error.message, 400);

    return NextResponse.json({ items: res.data ?? [] });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return jsonError("Not authenticated", 401);

    const profile = await supabase
      .from("domus_users")
      .select("id,family_id,role,name,email")
      .eq("id", user.id)
      .maybeSingle();

    if (profile.error) return jsonError(profile.error.message, 400);
    if (!profile.data?.family_id) return jsonError("Needs setup", 400);

    if (profile.data.role !== "admin") {
      return jsonError("Only admins can create transactions", 403);
    }

    const json = (await request.json().catch(() => null)) as unknown;
    const parsed = CreateTransactionSchema.safeParse(json);
    if (!parsed.success) {
      const msg = parsed.error.issues?.[0]?.message;
      return jsonError(typeof msg === "string" && msg.trim() ? msg : "Invalid body", 400);
    }

    // Validate category is visible (predefined or same family) and is a subcategory.
    const cat = await supabase
      .from("domus_budget_categories")
      .select("id,family_id,parent_id")
      .eq("id", parsed.data.category_id)
      .maybeSingle();

    if (cat.error) return jsonError(cat.error.message, 400);
    if (!cat.data) return jsonError("Category not found", 404);

    if (!cat.data.parent_id) {
      return jsonError("Selecciona una subcategoría (no una categoría padre)", 400);
    }

    if (cat.data.family_id && cat.data.family_id !== profile.data.family_id) {
      return jsonError("Forbidden", 403);
    }

    // Ensure accounts and get family account id.
    const ensure = await supabase.rpc("domus_ensure_accounts_for_current_user");
    if (ensure.error) return jsonError(ensure.error.message, 400);

    const first = Array.isArray(ensure.data) ? ensure.data[0] : null;
    const familyAccountId = (first as { family_account_id?: unknown } | null)?.family_account_id;
    if (typeof familyAccountId !== "string" || !familyAccountId) {
      return jsonError("Family account not available", 400);
    }

    const insertTx = await supabase
      .from("domus_transactions")
      .insert({
        family_id: profile.data.family_id,
        year: parsed.data.year,
        kind: parsed.data.kind,
        category_id: parsed.data.category_id,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        concept: parsed.data.concept,
        merchant: parsed.data.merchant || null,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (insertTx.error) return jsonError(insertTx.error.message, 400);

    const movementType = parsed.data.kind === "income" ? "deposit" : "withdrawal";
    const posted = await supabase.rpc("domus_post_movement", {
      p_account_id: familyAccountId,
      p_movement_type: movementType,
      p_amount: parsed.data.amount,
      p_concept: parsed.data.concept,
      p_category_code: parsed.data.category_id,
      p_reference_type: "transaction",
      p_reference_id: insertTx.data.id,
      p_related_user_id: null,
      p_evidence_url: null,
    });

    if (posted.error) return jsonError(posted.error.message, 400);

    const ledgerId = (posted.data as { ledger_id?: unknown } | null)?.ledger_id;
    if (typeof ledgerId === "string" && ledgerId) {
      await supabase.from("domus_transactions").update({ ledger_id: ledgerId }).eq("id", insertTx.data.id);
    }

    await logActivity(supabase, {
      family_id: profile.data.family_id,
      actor_id: user.id,
      actor_name: profile.data.name ?? null,
      actor_email: profile.data.email ?? null,
      module: "transactions",
      action: "create",
      entity: "transaction",
      entity_id: insertTx.data.id,
      summary: `Transacción registrada: ${parsed.data.concept}`,
      metadata: {
        year: parsed.data.year,
        kind: parsed.data.kind,
        category_id: parsed.data.category_id,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        merchant: parsed.data.merchant || null,
        ledger_id: typeof ledgerId === "string" ? ledgerId : null,
      },
    });

    return NextResponse.json({ id: insertTx.data.id, ledger_id: ledgerId ?? null });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
}
