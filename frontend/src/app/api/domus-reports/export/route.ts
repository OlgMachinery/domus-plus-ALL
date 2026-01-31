import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { jsonError } from "@/lib/http/respond";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import * as XLSX from "xlsx";
import {
  ExportBodySchema,
  clampDateRange,
  escapeHtml,
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

async function buildPreviewData(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  familyId: string;
  userId: string;
  reportType: ReportType;
  from: string;
  to: string;
}): Promise<{ title: string; columns: string[]; rows: Array<Array<string | number | null>> }> {
  const title = titleFor(params.reportType);
  const range = clampDateRange(params.from, params.to);
  const fromTs = isoDayStart(range.from);
  const toTs = isoDayEnd(range.to);

  const categoriesRes = await params.supabase
    .from("domus_budget_categories")
    .select("id,name,parent_id")
    .or(`family_id.is.null,family_id.eq.${params.familyId}`);

  if (categoriesRes.error) throw new Error(categoriesRes.error.message);
  const categories = (categoriesRes.data ?? []) as CategoryRow[];
  const categoryById = new Map(categories.map((c) => [c.id, c] as const));

  if (params.reportType === "transactions") {
    const res = await params.supabase
      .from("domus_transactions")
      .select("occurred_at,kind,concept,amount,currency,category_id")
      .eq("family_id", params.familyId)
      .gte("occurred_at", fromTs)
      .lte("occurred_at", toTs)
      .order("occurred_at", { ascending: false });

    if (res.error) throw new Error(res.error.message);

    const rows = (res.data ?? []).map((t) => {
      const sub = categoryById.get(t.category_id);
      const parent = sub?.parent_id ? categoryById.get(sub.parent_id) : null;
      const categoryName = parent?.name ?? sub?.name ?? "(Categoría)";
      const subcategoryName = sub?.parent_id ? sub.name : "(Subcategoría)";
      return [
        String(t.occurred_at).slice(0, 19).replace("T", " "),
        t.kind === "income" ? "Ingreso" : "Egreso",
        categoryName,
        subcategoryName,
        String(t.concept ?? ""),
        safeNumber(t.amount),
        String(t.currency ?? "MXN"),
      ];
    });

    return {
      title,
      columns: ["Fecha", "Tipo", "Categoría", "Subcategoría", "Descripción", "Monto", "Moneda"],
      rows,
    };
  }

  if (params.reportType === "income-expense") {
    const res = await params.supabase
      .from("domus_transactions")
      .select("occurred_at,kind,amount")
      .eq("family_id", params.familyId)
      .gte("occurred_at", fromTs)
      .lte("occurred_at", toTs)
      .order("occurred_at", { ascending: true });

    if (res.error) throw new Error(res.error.message);

    const byDay = new Map<string, { income: number; expense: number }>();
    for (const t of (res.data ?? []) as Array<{ occurred_at: string; kind: "income" | "expense"; amount: number }>) {
      const day = String(t.occurred_at).slice(0, 10);
      const entry = byDay.get(day) ?? { income: 0, expense: 0 };
      if (t.kind === "income") entry.income += safeNumber(t.amount);
      else entry.expense += safeNumber(t.amount);
      byDay.set(day, entry);
    }

    const rows = Array.from(byDay.entries()).map(([day, v]) => [day, v.income, v.expense, v.income - v.expense]);
    return { title, columns: ["Día", "Ingresos", "Egresos", "Balance"], rows };
  }

  if (params.reportType === "by-category") {
    const res = await params.supabase
      .from("domus_transactions")
      .select("category_id,amount")
      .eq("family_id", params.familyId)
      .eq("kind", "expense")
      .gte("occurred_at", fromTs)
      .lte("occurred_at", toTs);

    if (res.error) throw new Error(res.error.message);

    const agg = new Map<string, number>();
    for (const t of (res.data ?? []) as Array<{ category_id: string; amount: number }>) {
      agg.set(t.category_id, (agg.get(t.category_id) ?? 0) + safeNumber(t.amount));
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

    return { title, columns: ["Categoría", "Subcategoría", "Total Egresos"], rows };
  }

  if (params.reportType === "budgets") {
    const year = Number(range.from.slice(0, 4));
    const res = await params.supabase
      .from("domus_personal_budgets")
      .select("year,amount,currency,category_id")
      .eq("family_id", params.familyId)
      .eq("user_id", params.userId)
      .eq("year", year);

    if (res.error) throw new Error(res.error.message);

    const rows = (res.data ?? []).map((b) => {
      const sub = categoryById.get(b.category_id);
      const parent = sub?.parent_id ? categoryById.get(sub.parent_id) : null;
      const categoryName = parent?.name ?? sub?.name ?? "(Categoría)";
      const subcategoryName = sub?.parent_id ? sub.name : "(Subcategoría)";
      return [categoryName, subcategoryName, safeNumber(b.amount), String(b.currency ?? "MXN")];
    });

    return { title: `${title} (${year})`, columns: ["Categoría", "Subcategoría", "Monto", "Moneda"], rows };
  }

  // annual-budget
  const year = Number(range.from.slice(0, 4));

  const budgetsRes = await params.supabase
    .from("domus_annual_budgets")
    .select("amount,currency,category_id")
    .eq("family_id", params.familyId)
    .eq("year", year);

  if (budgetsRes.error) throw new Error(budgetsRes.error.message);

  const spentRes = await params.supabase
    .from("domus_transactions")
    .select("category_id,amount")
    .eq("family_id", params.familyId)
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

  return {
    title: `${title} (${year})`,
    columns: ["Categoría", "Subcategoría", "Budget", "Spent", "Remaining", "Moneda"],
    rows,
  };
}

function htmlDocument(params: { title: string; from: string; to: string; columns: string[]; rows: Array<Array<string | number | null>> }) {
  const head = `<tr>${params.columns
    .map((c) => `<th style="border:1px solid #e5e7eb;padding:6px;text-align:left;">${escapeHtml(c)}</th>`)
    .join("")}</tr>`;

  const body = params.rows
    .map(
      (r) =>
        `<tr>${r
          .map((v) => {
            const s = v === null || v === undefined ? "" : String(v);
            return `<td style="border:1px solid #e5e7eb;padding:6px;">${escapeHtml(s)}</td>`;
          })
          .join("")}</tr>`
    )
    .join("");

  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(params.title)}</title>
</head>
<body style="font-family: ui-sans-serif, system-ui; padding:16px;">
  <h1 style="margin:0 0 4px;">${escapeHtml(params.title)}</h1>
  <div style="font-size:12px;color:#6b7280;">${escapeHtml(params.from)} → ${escapeHtml(params.to)}</div>
  <table style="border-collapse:collapse;width:100%;margin-top:12px;">
    <thead>${head}</thead>
    <tbody>${body}</tbody>
  </table>
</body>
</html>`;
}

async function generatePdf(params: { title: string; from: string; to: string; columns: string[]; rows: Array<Array<string | number | null>> }) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pdfSafe = (text: string): string => {
    // pdf-lib's standard fonts use WinAnsi encoding, which can't encode some Unicode
    // characters (e.g. "→"). Replace common offenders with ASCII equivalents.
    return text
      .replaceAll("→", "->")
      .replaceAll("←", "<-")
      .replaceAll("↔", "<->")
      .replaceAll("—", "-")
      .replaceAll("–", "-")
      .replaceAll("“", '"')
      .replaceAll("”", '"')
      .replaceAll("‘", "'")
      .replaceAll("’", "'");
  };

  let page = doc.addPage();
  const { width, height } = page.getSize();

  let y = height - 48;
  const left = 48;

  page.drawText(pdfSafe(params.title), { x: left, y, size: 16, font: fontBold });
  y -= 18;
  page.drawText(pdfSafe(`${params.from} -> ${params.to}`), { x: left, y, size: 10, font, color: rgb(0.4, 0.45, 0.5) });
  y -= 18;

  const colLine = params.columns.join(" | ");
  page.drawText(pdfSafe(colLine.slice(0, 120)), { x: left, y, size: 9, font: fontBold });
  y -= 14;

  for (const r of params.rows.slice(0, 200)) {
    const line = r.map((v) => (v === null || v === undefined ? "" : String(v))).join(" | ");
    const clipped = line.length > 140 ? `${line.slice(0, 140)}...` : line;

    if (y < 60) {
      page = doc.addPage();
      y = page.getSize().height - 48;
    }

    page.drawText(pdfSafe(clipped), { x: left, y, size: 9, font });
    y -= 12;
  }

  return await doc.save();
}

function generateXlsx(params: { title: string; columns: string[]; rows: Array<Array<string | number | null>> }) {
  const data = [params.columns, ...params.rows];
  const ws = XLSX.utils.aoa_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) as Buffer;
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return jsonError("Not authenticated", 401);

    const json = (await request.json().catch(() => null)) as unknown;
    const parsed = ExportBodySchema.safeParse(json);
    if (!parsed.success) return jsonError("Invalid body", 400);

    const range = clampDateRange(parsed.data.from, parsed.data.to);

    const profile = await getProfile(supabase, user.id);

    const data = await buildPreviewData({
      supabase,
      familyId: profile.family_id,
      userId: profile.id,
      reportType: parsed.data.report_type,
      from: range.from,
      to: range.to,
    });

    if (parsed.data.format === "html") {
      const html = htmlDocument({
        title: data.title,
        from: range.from,
        to: range.to,
        columns: data.columns,
        rows: data.rows,
      });

      return new NextResponse(html, {
        status: 200,
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-disposition": `attachment; filename="report.html"`,
        },
      });
    }

    if (parsed.data.format === "pdf") {
      const bytes = await generatePdf({
        title: data.title,
        from: range.from,
        to: range.to,
        columns: data.columns,
        rows: data.rows,
      });

      const pdfBody = new Uint8Array(bytes);

      return new NextResponse(pdfBody, {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="report.pdf"`,
        },
      });
    }

    const xlsx = generateXlsx({ title: data.title, columns: data.columns, rows: data.rows });
    const xlsxBody = new Uint8Array(xlsx);
    return new NextResponse(xlsxBody, {
      status: 200,
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="report.xlsx"`,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    const status = /not authenticated/i.test(msg) ? 401 : 500;
    return jsonError(msg, status);
  }
}
