import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/http/respond";

const BodySchema = z.object({
  family_name: z.string().min(1),
  people: z
    .array(
      z.object({
        name: z.string().min(1),
        email: z.string().email().optional().or(z.literal("")),
        phone: z.string().optional().or(z.literal("")),
        role: z.enum(["admin", "member"]),
      })
    )
    .default([]),
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
    const people = body.people.map((p) => ({
      name: p.name,
      email: p.email || undefined,
      phone: p.phone || undefined,
      role: p.role,
    }));

    const { data, error } = await supabase.rpc("domus_setup_family", {
      p_family_name: body.family_name,
      p_people: people,
    });

    if (error) {
      return jsonError(error.message, 400);
    }

    return NextResponse.json(data);
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
}
