import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/http/respond";
import { logActivity } from "@/lib/activity/log";

const CreatePersonalBudgetSchema = z.object({
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
      .select("id,family_id,name,email")
      .eq("id", user.id)
      .maybeSingle();

    if (profile.error) return jsonError(profile.error.message, 400);
    if (!profile.data?.family_id) return jsonError("Needs setup", 400);

    const url = new URL(request.url);
    const yearRaw = url.searchParams.get("year");
    const year = Number(yearRaw || new Date().getFullYear());

    const res = await supabase
      .from("domus_personal_budgets")
      .select("id,year,amount,currency,category_id")
      .eq("family_id", profile.data.family_id)
      .eq("user_id", user.id)
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
      .select("id,family_id,name,email")
      .eq("id", user.id)
      .maybeSingle();

    if (profile.error) return jsonError(profile.error.message, 400);
    if (!profile.data?.family_id) return jsonError("Needs setup", 400);

    const json = (await request.json().catch(() => null)) as unknown;
    const parsed = CreatePersonalBudgetSchema.safeParse(json);
    if (!parsed.success) {
      const msg = parsed.error.issues?.[0]?.message;
      return jsonError(typeof msg === "string" && msg.trim() ? msg : "Invalid body", 400);
    }

    // Validate that category is visible (predefined or same family) and is a subcategory.
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

    const actorName = (profile.data as unknown as { name?: string | null }).name ?? null;
    const actorEmail = (profile.data as unknown as { email?: string | null }).email ?? null;

    // If a budget already exists for (user, year, subcategory), update it instead of failing.
    const existing = await supabase
      .from("domus_personal_budgets")
      .select("id")
      .eq("user_id", user.id)
      .eq("year", parsed.data.year)
      .eq("category_id", parsed.data.category_id)
      .maybeSingle();

    if (existing.error) return jsonError(existing.error.message, 400);

    if (existing.data?.id) {
      const updated = await supabase
        .from("domus_personal_budgets")
        .update({
          amount: parsed.data.amount,
          currency: parsed.data.currency,
        })
        .eq("id", existing.data.id)
        .select("id")
        .single();

      if (updated.error) return jsonError(updated.error.message, 400);

      await logActivity(supabase, {
        family_id: profile.data.family_id,
        actor_id: user.id,
        actor_name: actorName,
        actor_email: actorEmail,
        module: "personal_budget",
        action: "update",
        entity: "personal_budget",
        entity_id: updated.data.id,
        summary: `Presupuesto personal actualizado (${parsed.data.year})`,
        metadata: {
          year: parsed.data.year,
          category_id: parsed.data.category_id,
          amount: parsed.data.amount,
          currency: parsed.data.currency,
        },
      });

      return NextResponse.json({ id: updated.data.id, updated: true });
    }

    const insert = await supabase
      .from("domus_personal_budgets")
      .insert({
        user_id: user.id,
        family_id: profile.data.family_id,
        year: parsed.data.year,
        category_id: parsed.data.category_id,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
      })
      .select("id")
      .single();

    if (insert.error) {
      // Race-condition fallback: if unique constraint hits, update the existing row.
      const msg = insert.error.message || "";
      if (msg.includes("domus_personal_budgets_unique")) {
        const again = await supabase
          .from("domus_personal_budgets")
          .select("id")
          .eq("user_id", user.id)
          .eq("year", parsed.data.year)
          .eq("category_id", parsed.data.category_id)
          .maybeSingle();

        if (again.data?.id) {
          const updated = await supabase
            .from("domus_personal_budgets")
            .update({
              amount: parsed.data.amount,
              currency: parsed.data.currency,
            })
            .eq("id", again.data.id)
            .select("id")
            .single();

          if (updated.error) return jsonError(updated.error.message, 400);

          await logActivity(supabase, {
            family_id: profile.data.family_id,
            actor_id: user.id,
            actor_name: actorName,
            actor_email: actorEmail,
            module: "personal_budget",
            action: "update",
            entity: "personal_budget",
            entity_id: updated.data.id,
            summary: `Presupuesto personal actualizado (${parsed.data.year})`,
            metadata: {
              year: parsed.data.year,
              category_id: parsed.data.category_id,
              amount: parsed.data.amount,
              currency: parsed.data.currency,
            },
          });

          return NextResponse.json({ id: updated.data.id, updated: true });
        }
      }

      return jsonError(insert.error.message, 400);
    }

    await logActivity(supabase, {
      family_id: profile.data.family_id,
      actor_id: user.id,
      actor_name: actorName,
      actor_email: actorEmail,
      module: "personal_budget",
      action: "create",
      entity: "personal_budget",
      entity_id: insert.data.id,
      summary: `Presupuesto personal creado (${parsed.data.year})`,
      metadata: {
        year: parsed.data.year,
        category_id: parsed.data.category_id,
        amount: parsed.data.amount,
        currency: parsed.data.currency,
      },
    });

    return NextResponse.json({ id: insert.data.id, updated: false });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
}
