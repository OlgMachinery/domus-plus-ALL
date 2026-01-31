import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/http/respond";
import {
  PreviewBodySchema,
  clampDateRange,
  isoDayEnd,
  isoDayStart,
  safeNumber,
  type ReportType,
} from "../_shared";

type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
};

async function getProfile(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const profile = await supabase
    .from("domus_users")
    .select("id,family_id")
    .eq("id", userId)
    .maybeSingle();

  if (profile.error) throw new Error(profile.error.message);
  if (!profile.data?.family_id) throw new Error("Needs setup");
  return profile.data as { id: string; family_id: string };
}

function titleFor(type: ReportType): string {
  switch (type) {
    case "transactions":
      return "Reporte: Transacciones";
    case "income-expense":
      return "Reporte: Ingresos/Egresos";
    case "by-category":
      return "Reporte: Por Categoría";
    case "budgets":
      return "Reporte: Presupuestos";
    case "annual-budget":
      return "Reporte: Presupuesto Anual";
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return jsonError("Not authenticated", 401);

    const json = (await request.json().catch(() => null)) as unknown;
    const parsed = PreviewBodySchema.safeParse(json);
    if (!parsed.success) return jsonError("Invalid body", 400);

    const range = clampDateRange(parsed.data.from, parsed.data.to);
    const fromTs = isoDayStart(range.from);
    const toTs = isoDayEnd(range.to);

    const profile = await getProfile(supabase, user.id);

    const reportType = parsed.data.report_type;

    // Common category map (used in by-category + annual budget)
    const categoriesRes = await supabase
      .from("domus_budget_categories")
      .select("id,name,parent_id")
      .or(`family_id.is.null,family_id.eq.${profile.family_id}`);

    if (categoriesRes.error) return jsonError(categoriesRes.error.message, 400);

    const categories = (categoriesRes.data ?? []) as CategoryRow[];
    const categoryById = new Map(categories.map((c) => [c.id, c] as const));

    if (reportType === "transactions") {
      const res = await supabase
        .from("domus_transactions")
        .select("occurred_at,kind,concept,amount,currency,category_id")
        .eq("family_id", profile.family_id)
        .gte("occurred_at", fromTs)
        .lte("occurred_at", toTs)
        .order("occurred_at", { ascending: false });

      if (res.error) return jsonError(res.error.message, 400);

      const rows = (res.data ?? []).map((t) => {
        const sub = categoryById.get(t.category_id);
        const parent = sub?.parent_id ? categoryById.get(sub.parent_id) : null;
        const categoryName = parent?.name ?? sub?.name ?? "(Categoría)";
        const subcategoryName = sub?.parent_id ? sub.name : "(Subcategoría)";

        return [
          new Date(t.occurred_at as string).toLocaleString(),
          t.kind === "income" ? "Ingreso" : "Egreso",
          categoryName,
          subcategoryName,
          String(t.concept ?? ""),
          safeNumber(t.amount),
          String(t.currency ?? "MXN"),
        ];
      });

      return NextResponse.json({
        title: titleFor(reportType),
        columns: ["Fecha", "Tipo", "Categoría", "Subcategoría", "Descripción", "Monto", "Moneda"],
        rows,
      });
    }

    if (reportType === "income-expense") {
      const res = await supabase
        .from("domus_transactions")
        .select("occurred_at,kind,amount")
        .eq("family_id", profile.family_id)
        .gte("occurred_at", fromTs)
        .lte("occurred_at", toTs)
        .order("occurred_at", { ascending: true });

      if (res.error) return jsonError(res.error.message, 400);

      const byDay = new Map<string, { income: number; expense: number }>();
      for (const t of (res.data ?? []) as Array<{ occurred_at: string; kind: "income" | "expense"; amount: number }>) {
        const day = String(t.occurred_at).slice(0, 10);
        const entry = byDay.get(day) ?? { income: 0, expense: 0 };
        if (t.kind === "income") entry.income += safeNumber(t.amount);
        else entry.expense += safeNumber(t.amount);
        byDay.set(day, entry);
      }

      const rows = Array.from(byDay.entries()).map(([day, v]) => [day, v.income, v.expense, v.income - v.expense]);

      const totalIncome = rows.reduce((acc, r) => acc + safeNumber(r[1]), 0);
      const totalExpense = rows.reduce((acc, r) => acc + safeNumber(r[2]), 0);

      return NextResponse.json({
        title: titleFor(reportType),
        columns: ["Día", "Ingresos", "Egresos", "Balance"],
        rows,
        summary: {
          total_income: totalIncome,
          total_expense: totalExpense,
          net: totalIncome - totalExpense,
        },
      });
    }

    if (reportType === "by-category") {
      const res = await supabase
        .from("domus_transactions")
        .select("category_id,amount")
        .eq("family_id", profile.family_id)
        .eq("kind", "expense")
        .gte("occurred_at", fromTs)
        .lte("occurred_at", toTs);

      if (res.error) return jsonError(res.error.message, 400);

      const agg = new Map<string, number>();
      for (const t of (res.data ?? []) as Array<{ category_id: string; amount: number }>) {
        const prev = agg.get(t.category_id) ?? 0;
        agg.set(t.category_id, prev + safeNumber(t.amount));
      }

      const rows = Array.from(agg.entries())
        .map(([subcategoryId, total]) => {
          const sub = categoryById.get(subcategoryId);
          const parent = sub?.parent_id ? categoryById.get(sub.parent_id) : null;
          const categoryName = parent?.name ?? sub?.name ?? "(Categoría)";
          const subcategoryName = sub?.parent_id ? sub.name : "(Subcategoría)";
          return [categoryName, subcategoryName, total];
        })
        .sort((a, b) => safeNumber(b[2]) - safeNumber(a[2]));

      const totalExpense = rows.reduce((acc, r) => acc + safeNumber(r[2]), 0);

      return NextResponse.json({
        title: titleFor(reportType),
        columns: ["Categoría", "Subcategoría", "Total Egresos"],
        rows,
        summary: { total_expense: totalExpense },
      });
    }

    if (reportType === "budgets") {
      const year = Number(range.from.slice(0, 4));
      const res = await supabase
        .from("domus_personal_budgets")
        .select("year,amount,currency,category_id")
        .eq("family_id", profile.family_id)
        .eq("user_id", profile.id)
        .eq("year", year);

      if (res.error) return jsonError(res.error.message, 400);

      const rows = (res.data ?? []).map((b) => {
        const sub = categoryById.get(b.category_id);
        const parent = sub?.parent_id ? categoryById.get(sub.parent_id) : null;
        const categoryName = parent?.name ?? sub?.name ?? "(Categoría)";
        const subcategoryName = sub?.parent_id ? sub.name : "(Subcategoría)";
        return [categoryName, subcategoryName, safeNumber(b.amount), String(b.currency ?? "MXN")];
      });

      const total = rows.reduce((acc, r) => acc + safeNumber(r[2]), 0);

      return NextResponse.json({
        title: titleFor(reportType),
        columns: ["Categoría", "Subcategoría", "Monto", "Moneda"],
        rows,
        summary: { total_budget: total, year },
      });
    }

    // annual-budget
    const year = Number(range.from.slice(0, 4));

    const budgetsRes = await supabase
      .from("domus_annual_budgets")
      .select("amount,currency,category_id")
      .eq("family_id", profile.family_id)
      .eq("year", year);

    if (budgetsRes.error) return jsonError(budgetsRes.error.message, 400);

    const spentRes = await supabase
      .from("domus_transactions")
      .select("category_id,amount")
      .eq("family_id", profile.family_id)
      .eq("year", year)
      .eq("kind", "expense");

    const spentBy = new Map<string, number>();
    if (!spentRes.error) {
      for (const t of (spentRes.data ?? []) as Array<{ category_id: string; amount: number }>) {
        spentBy.set(t.category_id, (spentBy.get(t.category_id) ?? 0) + safeNumber(t.amount));
      }
    }

    const rows = (budgetsRes.data ?? []).map((b) => {
      const sub = categoryById.get(b.category_id);
      const parent = sub?.parent_id ? categoryById.get(sub.parent_id) : null;
      const categoryName = parent?.name ?? sub?.name ?? "(Categoría)";
      const subcategoryName = sub?.parent_id ? sub.name : "(Subcategoría)";
      const budget = safeNumber(b.amount);
      const spent = spentBy.get(b.category_id) ?? 0;
      const remaining = budget - spent;
      return [categoryName, subcategoryName, budget, spent, remaining, String(b.currency ?? "MXN")];
    });

    const annual = rows.reduce((acc, r) => acc + safeNumber(r[2]), 0);
    const spent = rows.reduce((acc, r) => acc + safeNumber(r[3]), 0);

    return NextResponse.json({
      title: titleFor(reportType),
      columns: ["Categoría", "Subcategoría", "Budget", "Spent", "Remaining", "Moneda"],
      rows,
      summary: { annual_budget: annual, spent, remaining: annual - spent, year },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const status = /not authenticated/i.test(msg) ? 401 : 500;
    return jsonError(msg, status);
  }
}
