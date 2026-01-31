import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/http/respond";
import { logActivity } from "@/lib/activity/log";

const CreateCategorySchema = z.object({
  name: z.string().trim().min(1).max(80),
  parent_id: z.string().uuid().nullable().optional(),
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

    const res = await supabase
      .from("domus_budget_categories")
      .select("id,name,family_id,parent_id,sort_order")
      .or(`family_id.is.null,family_id.eq.${profile.data.family_id}`)
      .order("sort_order", { ascending: true, nullsFirst: false })
      .order("name", { ascending: true });

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
      return jsonError("Only admins can create categories", 403);
    }

    const json = (await request.json().catch(() => null)) as unknown;
    const parsed = CreateCategorySchema.safeParse(json);
    if (!parsed.success) {
      return jsonError("Invalid body", 400);
    }

    // If creating a subcategory, validate the parent category:
    // - Must exist
    // - Must be a top-level category (parent_id is null)
    // - Must be visible to this family (global or same family)
    const parentId = parsed.data.parent_id ?? null;
    if (parentId) {
      const parent = await supabase
        .from("domus_budget_categories")
        .select("id,family_id,parent_id")
        .eq("id", parentId)
        .maybeSingle();

      if (parent.error) return jsonError(parent.error.message, 400);
      if (!parent.data) return jsonError("Parent category not found", 404);

      if (parent.data.parent_id) {
        return jsonError("El parent debe ser una categoría (no una subcategoría)", 400);
      }

      if (parent.data.family_id && parent.data.family_id !== profile.data.family_id) {
        return jsonError("Forbidden", 403);
      }
    }

    const insert = await supabase
      .from("domus_budget_categories")
      .insert({
        family_id: profile.data.family_id,
        parent_id: parentId,
        name: parsed.data.name,
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
      module: "categories",
      action: "create",
      entity: parentId ? "subcategory" : "category",
      entity_id: insert.data.id,
      summary: parentId
        ? `Subcategoría creada: ${parsed.data.name}`
        : `Categoría creada: ${parsed.data.name}`,
      metadata: { parent_id: parentId },
    });

    return NextResponse.json({ id: insert.data.id });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
}
