import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/http/respond";
import { logActivity } from "@/lib/activity/log";

const CreateAnnualBudgetSchema = z.object({
  year: z.number().int().min(2000).max(2100),
  category_id: z.string().uuid(),
  amount: z.number().gt(0, "El monto debe ser mayor a 0"),
  currency: z.string().trim().min(1).max(8).default("MXN"),
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
    const year = Number(yearRaw || new Date().getFullYear());

    const res = await supabase
      .from("domus_annual_budgets")
      .select("id,year,amount,currency,category_id")
      .eq("family_id", profile.data.family_id)
      .eq("year", year)
      .order("created_at", { ascending: false });

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
      return jsonError("Only admins can create budgets", 403);
    }

    const json = (await request.json().catch(() => null)) as unknown;
    const parsed = CreateAnnualBudgetSchema.safeParse(json);
    if (!parsed.success) {
      const msg = parsed.error.issues?.[0]?.message;
      return jsonError(typeof msg === "string" && msg.trim() ? msg : "Invalid body", 400);
    }

    // Validate that category is visible (predefined or same family)
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

    const insert = await supabase
      .from("domus_annual_budgets")
      .insert({
        family_id: profile.data.family_id,
        year: parsed.data.year,
        category_id: parsed.data.category_id,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (insert.error) return jsonError(insert.error.message, 400);

    await logActivity(supabase, {
      family_id: profile.data.family_id,
      actor_id: user.id,
      actor_name: profile.data.name ?? null,
      actor_email: profile.data.email ?? null,
      module: "budgets",
      action: "create",
      entity: "annual_budget",
      entity_id: insert.data.id,
      summary: `Presupuesto anual creado (${parsed.data.year})`,
      metadata: {
        year: parsed.data.year,
        category_id: parsed.data.category_id,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
      },
    });

    return NextResponse.json({ id: insert.data.id });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
}
