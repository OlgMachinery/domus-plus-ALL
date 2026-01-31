"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useLang, useTr, type Lang } from "@/lib/i18n/client";

export type ReceiptRow = {
  id: string;
  created_at: string;
  receipt_date: string;
  amount: number | null;
  merchant: string | null;
  note: string | null;
  file_path: string;
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  ai_status?: "pending" | "done" | "error";
  ai_updated_at?: string | null;
  extracted_total?: number | null;
  extracted_currency?: string | null;
  extracted_date?: string | null;
  extracted_merchant?: string | null;
};

export type RecordsClientProps = {
  initialReceipts: ReceiptRow[];
};

function formatMoney(amount: number | null, currency: string | null | undefined, lang: Lang): string {
  if (amount === null || Number.isNaN(amount)) return "—";
  const cur = (currency || "MXN").toUpperCase();
  try {
    return new Intl.NumberFormat(lang === "en" ? "en-US" : "es-MX", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${cur}`;
  }
}

function detailFromJson(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  if (!("detail" in body)) return null;
  const value = (body as { detail?: unknown }).detail;
  return typeof value === "string" && value.trim() ? value : null;
}

function debugFromJson(body: unknown): unknown | null {
  if (!body || typeof body !== "object") return null;
  if (!("debug" in body)) return null;
  return (body as { debug?: unknown }).debug ?? null;
}

export default function RecordsClient(props: RecordsClientProps) {
  const router = useRouter();
  const lang = useLang();
  const t = useTr();
  const supabase = useMemo(() => createClient(), []);

  const [tab, setTab] = useState<"done" | "pending" | "error" | "all">("done");
  const [openBusyId, setOpenBusyId] = useState<string | null>(null);
  const [analyzeBusyId, setAnalyzeBusyId] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; debug?: unknown } | null>(null);
  const [isPending, startTransition] = useTransition();

  const receipts = useMemo(() => {
    if (tab === "all") return props.initialReceipts;
    return props.initialReceipts.filter((r) => (r.ai_status ?? "pending") === tab);
  }, [props.initialReceipts, tab]);

  async function openReceipt(r: ReceiptRow) {
    setError(null);
    setInfo(null);
    setOpenBusyId(r.id);

    const { data, error: signError } = await supabase.storage
      .from("domus-receipts")
      .createSignedUrl(r.file_path, 60);

    setOpenBusyId(null);

    if (signError || !data?.signedUrl) {
      setError({ message: `No se pudo generar link: ${signError?.message ?? "unknown error"}` });
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function analyzeReceipt(r: ReceiptRow) {
    setError(null);
    setInfo(null);
    setAnalyzeBusyId(r.id);

    const res = await fetch(`/api/domus-receipts/${encodeURIComponent(r.id)}/analyze`, {
      method: "POST",
    });
    const body = (await res.json().catch(() => null)) as unknown;

    setAnalyzeBusyId(null);

    if (!res.ok) {
      setError({
        message: `❌ ${detailFromJson(body) || "No se pudo analizar"}`,
        debug: debugFromJson(body) ?? undefined,
      });
      return;
    }

    setInfo("✅ Analizado. Actualizando…");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("Registros de Usuario", "User Records")}</h1>
            <p className="mt-1 text-sm muted">{t("Visualiza todos tus tickets y recibos procesados", "View all your processed receipts")}</p>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button className={tab === "done" ? "btn btn-primary" : "btn"} type="button" onClick={() => setTab("done")}>
              {t("Procesados", "Processed")}
            </button>
            <button
              className={tab === "pending" ? "btn btn-primary" : "btn"}
              type="button"
              onClick={() => setTab("pending")}
            >
              {t("Pendientes", "Pending")}
            </button>
            <button className={tab === "error" ? "btn btn-primary" : "btn"} type="button" onClick={() => setTab("error")}>
              {t("Error", "Error")}
            </button>
            <button className={tab === "all" ? "btn btn-primary" : "btn"} type="button" onClick={() => setTab("all")}>
              {t("Todos", "All")}
            </button>
          </div>

          <button className="btn" type="button" onClick={() => router.refresh()} disabled={isPending}>
            {t("Actualizar", "Refresh")}
          </button>
        </div>

        {error ? (
          <div className="callout callout-error mt-4">
            <div>{error.message}</div>
            {error.debug ? (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs">Ver debug</summary>
                <pre className="mt-2 whitespace-pre-wrap break-words text-xs">
                  {JSON.stringify(error.debug, null, 2)}
                </pre>
              </details>
            ) : null}
          </div>
        ) : null}
        {info ? <div className="callout callout-success mt-4">{info}</div> : null}

        <div className="mt-6">
          {receipts.length === 0 ? (
            <div className="flex h-40 items-center justify-center rounded-lg border bg-white text-sm muted">
              {tab === "done" ? "No hay recibos procesados" : "No hay registros para este filtro"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="p-2 text-left">Recibo</th>
                    <th className="p-2 text-left">Estado</th>
                    <th className="p-2 text-left">Extraído</th>
                    <th className="p-2 text-left">Subido</th>
                    <th className="p-2 text-left">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {receipts.map((r) => {
                    const status = r.ai_status ?? "pending";
                    const statusClass =
                      status === "done"
                        ? "bg-emerald-100 text-emerald-800"
                        : status === "error"
                          ? "bg-amber-100 text-amber-800"
                          : "bg-slate-100 text-slate-700";

                    return (
                      <tr key={r.id} className="border-b">
                        <td className="p-2">
                          <div className="font-medium truncate max-w-[280px]">{r.file_name}</div>
                          <div className="text-xs muted truncate max-w-[280px]">
                            {r.merchant ?? r.note ?? "—"}
                          </div>
                        </td>
                        <td className="p-2">
                          <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass}`}>
                            {status === "done" ? "Procesado" : status === "error" ? "Error" : "Pendiente"}
                          </span>
                        </td>
                        <td className="p-2">
                          {status === "done" ? (
                            <div className="space-y-0.5">
                              <div className="text-xs muted">{r.extracted_merchant ?? "(sin comercio)"}</div>
                              <div className="text-xs muted">{r.extracted_date ?? "(sin fecha)"}</div>
                              <div className="font-medium">
                                {formatMoney(r.extracted_total ?? null, r.extracted_currency ?? "MXN", lang)}
                              </div>
                            </div>
                          ) : (
                            <div className="text-xs muted">—</div>
                          )}
                        </td>
                        <td className="p-2 text-xs muted">{new Date(r.created_at).toLocaleString()}</td>
                        <td className="p-2">
                          <div className="flex items-center gap-2">
                            <button
                              className="btn"
                              type="button"
                              onClick={() => openReceipt(r)}
                              disabled={openBusyId === r.id}
                            >
                              {openBusyId === r.id ? "Abriendo…" : "Ver"}
                            </button>
                            <button
                              className="btn btn-primary"
                              type="button"
                              onClick={() => analyzeReceipt(r)}
                              disabled={analyzeBusyId === r.id || isPending}
                              title={
                                r.mime_type && r.mime_type.startsWith("image/")
                                  ? "Extrae monto/fecha/comercio"
                                  : "Por ahora solo imágenes (no PDF)"
                              }
                            >
                              {analyzeBusyId === r.id ? "Analizando…" : "Analizar"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
