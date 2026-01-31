import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/http/respond";
import { logActivity } from "@/lib/activity/log";

const NumberLike = z.preprocess((value) => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[^0-9,.-]/g, "").trim();
    if (!cleaned) return null;
    const normalized =
      cleaned.includes(",") && !cleaned.includes(".") ? cleaned.replace(",", ".") : cleaned.replace(/,/g, "");
    const n = Number(normalized);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}, z.number().nullable());

const ItemSchema = z.object({
  description: z.string().nullable().optional(),
  quantity: NumberLike.nullable().optional(),
  unit_price: NumberLike.nullable().optional(),
  total: NumberLike.nullable().optional(),
});

const ApplyReceiptSchema = z.object({
  category_id: z.string().uuid(),
  currency: z.string().trim().min(1).max(8).optional().default("MXN"),
  amount: z.number().gt(0).optional(),
  items: z.array(ItemSchema).optional().default([]),
  concept: z.string().trim().min(1).max(140).optional(),
});

function safeNumber(n: unknown): number {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  if (typeof n === "string" && n.trim()) {
    const x = Number(n);
    if (Number.isFinite(x)) return x;
  }
  return 0;
}

function computeItemsSum(items: Array<z.infer<typeof ItemSchema>>): number {
  let sum = 0;
  for (const it of items) {
    const t = it.total;
    if (typeof t === "number" && Number.isFinite(t)) {
      sum += t;
      continue;
    }
    const q = typeof it.quantity === "number" && Number.isFinite(it.quantity) ? it.quantity : null;
    const u = typeof it.unit_price === "number" && Number.isFinite(it.unit_price) ? it.unit_price : null;
    if (q !== null && u !== null) sum += q * u;
  }
  return Math.round(sum * 100) / 100;
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
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
      return jsonError("Only admins can apply receipts to budgets", 403);
    }

    const { id } = await ctx.params;
    if (!id) return jsonError("Missing id", 400);

    const json = (await request.json().catch(() => null)) as unknown;
    const parsed = ApplyReceiptSchema.safeParse(json);
    if (!parsed.success) {
      const msg = parsed.error.issues?.[0]?.message;
      return jsonError(typeof msg === "string" && msg.trim() ? msg : "Invalid body", 400);
    }

    const receiptRes = await supabase
      .from("domus_receipts")
      .select(
        "id,family_id,uploaded_by,receipt_date,amount,merchant,file_name,ai_extracted,extracted_total,extracted_currency,extracted_date,extracted_merchant"
      )
      .eq("id", id)
      .maybeSingle();

    if (receiptRes.error) return jsonError(receiptRes.error.message, 400);
    if (!receiptRes.data) return jsonError("Receipt not found", 404);
    if (receiptRes.data.family_id !== profile.data.family_id) return jsonError("Forbidden", 403);

    // Validate category is visible (predefined or same family) and is a subcategory.
    const cat = await supabase
      .from("domus_budget_categories")
      .select("id,family_id,parent_id,name")
      .eq("id", parsed.data.category_id)
      .maybeSingle();

    if (cat.error) return jsonError(cat.error.message, 400);
    if (!cat.data) return jsonError("Category not found", 404);
    if (!cat.data.parent_id) return jsonError("Selecciona una subcategoría (no una categoría padre)", 400);
    if (cat.data.family_id && cat.data.family_id !== profile.data.family_id) return jsonError("Forbidden", 403);

    const itemsSum = computeItemsSum(parsed.data.items);

    // If items were provided, enforce that the posted amount matches the items sum.
    let amountToPost = parsed.data.amount;
    if (parsed.data.items.length > 0) {
      if (!amountToPost || !Number.isFinite(amountToPost)) amountToPost = itemsSum;
      const diff = Math.abs((amountToPost ?? 0) - itemsSum);
      if (diff > 0.01) {
        return jsonError(
          `La suma de artículos (${itemsSum}) no cuadra con el total (${amountToPost}). Ajusta artículos o total antes de aplicar.`,
          400
        );
      }
    }

    if (!amountToPost || !Number.isFinite(amountToPost) || amountToPost <= 0) {
      const fallback =
        safeNumber(receiptRes.data.extracted_total) || safeNumber(receiptRes.data.amount) || (parsed.data.items.length ? itemsSum : 0);
      if (fallback <= 0) return jsonError("Monto inválido", 400);
      amountToPost = fallback;
    }

    const occurredDate =
      (typeof receiptRes.data.extracted_date === "string" && receiptRes.data.extracted_date) ||
      (typeof receiptRes.data.receipt_date === "string" && receiptRes.data.receipt_date);

    const occurredAt = occurredDate ? new Date(`${occurredDate}T12:00:00.000Z`) : new Date();
    const year = occurredAt.getUTCFullYear();

    const merchant =
      (typeof receiptRes.data.extracted_merchant === "string" && receiptRes.data.extracted_merchant) ||
      (typeof receiptRes.data.merchant === "string" && receiptRes.data.merchant) ||
      null;

    const currency =
      (typeof receiptRes.data.extracted_currency === "string" && receiptRes.data.extracted_currency) ||
      parsed.data.currency ||
      "MXN";

    const concept =
      parsed.data.concept ||
      `Recibo: ${merchant || receiptRes.data.file_name || receiptRes.data.id}`;

    const insertTx = await supabase
      .from("domus_transactions")
      .insert({
        family_id: profile.data.family_id,
        year,
        kind: "expense",
        category_id: parsed.data.category_id,
        amount: amountToPost,
        currency,
        concept,
        merchant,
        occurred_at: occurredAt.toISOString(),
        created_by: user.id,
      })
      .select("id")
      .single();

    if (insertTx.error) return jsonError(insertTx.error.message, 400);

    // Update receipt: store items + applied metadata.
    const nowIso = new Date().toISOString();
    const baseExtracted =
      receiptRes.data.ai_extracted && typeof receiptRes.data.ai_extracted === "object" ? receiptRes.data.ai_extracted : {};

    const nextExtracted = {
      ...(baseExtracted as Record<string, unknown>),
      items: parsed.data.items,
      items_sum: itemsSum,
      applied: {
        transaction_id: insertTx.data.id,
        category_id: parsed.data.category_id,
        amount: amountToPost,
        currency,
        applied_at: nowIso,
      },
    };

    // Try writing the dedicated columns if the migration exists.
    const updatePayload = {
      ai_extracted: nextExtracted,
      ai_status: "done",
      ai_error: null,
      ai_updated_at: nowIso,
      applied_transaction_id: insertTx.data.id,
      applied_category_id: parsed.data.category_id,
      applied_amount: amountToPost,
      applied_currency: currency,
      applied_at: nowIso,
    } as any;

    const updateRes = await supabase.from("domus_receipts").update(updatePayload).eq("id", receiptRes.data.id);

    if (updateRes.error) {
      // Fallback: update only ai_extracted if the new columns aren't present yet.
      const msg = String(updateRes.error.message || "");
      if (/applied_(transaction_id|category_id|amount|currency|at)/i.test(msg) || /does not exist/i.test(msg)) {
        const fallbackUpdate = await supabase
          .from("domus_receipts")
          .update({
            ai_extracted: nextExtracted,
            ai_status: "done",
            ai_error: null,
            ai_updated_at: nowIso,
          })
          .eq("id", receiptRes.data.id);
        if (fallbackUpdate.error) return jsonError(fallbackUpdate.error.message, 400);
      } else {
        return jsonError(updateRes.error.message, 400);
      }
    }

    await logActivity(supabase, {
      family_id: profile.data.family_id,
      actor_id: user.id,
      actor_name: profile.data.name ?? null,
      actor_email: profile.data.email ?? null,
      module: "receipts",
      action: "apply",
      entity: "receipt",
      entity_id: receiptRes.data.id,
      summary: `Recibo aplicado a presupuesto: ${concept}`,
      metadata: {
        receipt_id: receiptRes.data.id,
        transaction_id: insertTx.data.id,
        category_id: parsed.data.category_id,
        amount: amountToPost,
        currency,
        items_count: parsed.data.items.length,
      },
    });

    return NextResponse.json({
      ok: true,
      transaction_id: insertTx.data.id,
      amount: amountToPost,
      currency,
      items_sum: itemsSum,
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
}
