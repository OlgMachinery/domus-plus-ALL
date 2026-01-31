"use client";

import { useMemo, useState, useTransition } from "react";
import { useLang, useTr, type Lang } from "@/lib/i18n/client";

type ReportType = "transactions" | "income-expense" | "by-category" | "budgets" | "annual-budget";

type PreviewRow = {
  columns: string[];
  values: Array<string | number | null>;
};

type PreviewData = {
  title: string;
  columns: string[];
  rows: Array<Array<string | number | null>>;
  summary?: Record<string, string | number>;
};

function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function formatMoney(amount: number, currency: string, lang: Lang): string {
  try {
    return new Intl.NumberFormat(lang === "en" ? "en-US" : "es-MX", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

function detailFromJson(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  if (!("detail" in body)) return null;
  const value = (body as { detail?: unknown }).detail;
  return typeof value === "string" && value.trim() ? value : null;
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export default function ReportsClient() {
  const lang = useLang();
  const t = useTr();
  const today = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => new Date(today.getFullYear(), today.getMonth(), 1), [today]);

  const [reportType, setReportType] = useState<ReportType>("transactions");
  const [from, setFrom] = useState<string>(toIsoDate(monthStart));
  const [to, setTo] = useState<string>(toIsoDate(today));

  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function loadPreview() {
    setError(null);
    setInfo(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/domus-reports/preview", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ report_type: reportType, from, to }),
        });

        const body = (await res.json().catch(() => null)) as unknown;
        if (!res.ok) {
          setError(detailFromJson(body) || t("No se pudo generar la vista previa", "Could not generate preview"));
          setPreview(null);
          return;
        }

        setPreview(body as PreviewData);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error desconocido");
        setPreview(null);
      }
    });
  }

  async function exportReport(format: "html" | "pdf" | "xlsx") {
    setError(null);
    setInfo(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/domus-reports/export", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ report_type: reportType, from, to, format }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as unknown;
          setError(detailFromJson(body) || "No se pudo exportar");
          return;
        }

        const blob = await res.blob();
        const filenameBase = `domus-report-${reportType}-${from}-to-${to}`;
        const filename =
          format === "pdf" ? `${filenameBase}.pdf` : format === "xlsx" ? `${filenameBase}.xlsx` : `${filenameBase}.html`;

        downloadBlob(blob, filename);
        setInfo("✅ Exportado.");
      } catch (e) {
        setError(e instanceof Error ? e.message : t("Error desconocido", "Unknown error"));
      }
    });
  }

  function printPreview() {
    if (!preview) {
      setInfo("Genera una vista previa primero.");
      return;
    }

    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) return;

    const rowsHtml = preview.rows
      .map(
        (r) =>
          `<tr>${r
            .map((v) => {
              const s = v === null || v === undefined ? "" : String(v);
              return `<td style="border:1px solid #e5e7eb;padding:6px;">${s}</td>`;
            })
            .join("")}</tr>`
      )
      .join("");

    const headHtml = `<tr>${preview.columns
      .map((c) => `<th style="border:1px solid #e5e7eb;padding:6px;text-align:left;">${c}</th>`)
      .join("")}</tr>`;

    const summaryHtml = preview.summary
      ? `<div style="margin:12px 0;display:flex;gap:16px;flex-wrap:wrap;">
          ${Object.entries(preview.summary)
            .map(([k, v]) => `<div><div style="font-size:12px;color:#6b7280">${k}</div><div style="font-weight:600">${v}</div></div>`)
            .join("")}
        </div>`
      : "";

    w.document.write(`<!doctype html><html><head><meta charset="utf-8"/><title>${preview.title}</title></head>
      <body style="font-family:ui-sans-serif,system-ui; padding:16px;">
        <h1 style="margin:0 0 4px;">${preview.title}</h1>
        <div style="font-size:12px;color:#6b7280;">${from} → ${to}</div>
        ${summaryHtml}
        <table style="border-collapse:collapse;width:100%;margin-top:12px;">
          <thead>${headHtml}</thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </body></html>`);
    w.document.close();
    w.focus();
    w.print();
  }

  const typeButtons: Array<{ key: ReportType; label: string }> = [
    { key: "transactions", label: t("Transacciones", "Transactions") },
    { key: "income-expense", label: t("Ingresos/Egresos", "Income/Expenses") },
    { key: "by-category", label: t("Por Categoría", "By Category") },
    { key: "budgets", label: t("Presupuestos", "Budgets") },
    { key: "annual-budget", label: t("Presupuesto Anual", "Annual Budget") },
  ];

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("Reportes", "Reports")}</h1>
            <p className="mt-1 text-sm muted">{t("Genera y exporta reportes financieros", "Generate and export financial reports")}</p>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold">{t("Tipo de Reporte", "Report Type")}</h2>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          {typeButtons.slice(0, 3).map((b) => (
            <button
              key={b.key}
              type="button"
              className={reportType === b.key ? "btn btn-primary" : "btn"}
              onClick={() => setReportType(b.key)}
            >
              {b.label}
            </button>
          ))}
          {typeButtons.slice(3).map((b) => (
            <button
              key={b.key}
              type="button"
              className={reportType === b.key ? "btn btn-primary" : "btn"}
              onClick={() => setReportType(b.key)}
            >
              {b.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold">{t("Período", "Period")}</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <label className="text-sm font-medium">{t("Desde", "From")}</label>
            <input className="input mt-1 w-full" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div>
            <label className="text-sm font-medium">{t("Hasta", "To")}</label>
            <input className="input mt-1 w-full" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <button className="btn btn-primary" type="button" onClick={loadPreview} disabled={isPending}>
            {isPending ? t("Generando…", "Generating…") : t("Generar vista previa", "Generate preview")}
          </button>
          {preview?.summary?.total_income !== undefined || preview?.summary?.total_expense !== undefined ? (
            <div className="text-sm muted">
              {preview.summary?.total_income !== undefined
                ? `${t("Ingresos", "Income")}: ${formatMoney(Number(preview.summary.total_income), "MXN", lang)}`
                : null}
              {preview.summary?.total_expense !== undefined
                ? `  ${t("Egresos", "Expenses")}: ${formatMoney(Number(preview.summary.total_expense), "MXN", lang)}`
                : null}
            </div>
          ) : null}
        </div>

        {error ? <div className="callout callout-error mt-4">{error}</div> : null}
        {info ? <div className="callout callout-success mt-4">{info}</div> : null}
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold">Exportar Reporte</h2>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="btn btn-primary" type="button" onClick={() => exportReport("html")} disabled={isPending}>
            Exportar HTML
          </button>
          <button className="btn btn-primary" type="button" onClick={() => exportReport("pdf")} disabled={isPending}>
            Exportar PDF
          </button>
          <button className="btn btn-primary" type="button" onClick={() => exportReport("xlsx")} disabled={isPending}>
            Exportar Excel
          </button>
          <button className="btn" type="button" onClick={printPreview} disabled={isPending}>
            Imprimir
          </button>
        </div>
      </div>

      <div className="card">
        <h2 className="text-lg font-semibold">Vista Previa</h2>
        <div className="mt-4">
          {!preview ? (
            <div className="flex h-40 items-center justify-center rounded-lg border bg-white text-sm muted">
              Genera una vista previa para ver el contenido.
            </div>
          ) : preview.rows.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-lg border bg-white text-sm muted">
              No hay datos para el periodo seleccionado.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    {preview.columns.map((c) => (
                      <th key={c} className="p-2 text-left">
                        {c}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((r, idx) => (
                    <tr key={idx} className="border-b">
                      {r.map((v, j) => (
                        <td key={j} className="p-2">
                          {v === null || v === undefined ? "" : String(v)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
