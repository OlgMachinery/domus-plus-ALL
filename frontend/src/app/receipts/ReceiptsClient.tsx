// Helpers para desglose y formateo
function parseMoney(val: any): number {
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    return Number(val.replace(/[^\d.-]+/g, '')) || 0;
  }
  return 0;
}

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function calcLine(item: any, ivaDefault = 0.16) {
  const qty = parseMoney(item.quantity) || 1;
  const unit = parseMoney(item.unit_price);
  const discount = parseMoney(item.discount);
  const iva = typeof item.iva === 'number' ? item.iva : ivaDefault;
  const neto = round2(qty * unit - discount);
  const ivaVal = round2(neto * iva);
  const bruto = round2(neto + ivaVal);
  return { neto, iva: ivaVal, bruto };
}

function calcTicketTotals(items: any[], ivaDefault = 0.16) {
  let totalNeto = 0, ivaTotal = 0, totalBruto = 0;
  for (const it of items) {
    const { neto, iva, bruto } = calcLine(it, ivaDefault);
    totalNeto += neto;
    ivaTotal += iva;
    totalBruto += bruto;
  }
  return {
    totalNeto: round2(totalNeto),
    ivaTotal: round2(ivaTotal),
    totalBruto: round2(totalBruto),
  };
}
"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

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
  ai_extracted?: unknown;
};

export type BudgetCategory = {
  id: string;
  name: string;
  family_id: string | null;
  parent_id: string | null;
  sort_order: number | null;
};

export type ReceiptsClientProps = {
  familyId: string;
  userId: string;
  initialReceipts: ReceiptRow[];
  categories: BudgetCategory[];
};

type ReceiptItem = {
  description?: string | null;
  quantity?: number | null;
  unit_price?: number | null;
  total?: number | null;
  iva?: number | null;
  discount?: number | null;
};

function safeNum(n: unknown): number {
  if (typeof n === "number" && Number.isFinite(n)) return n;
  return 0;
}

function parseItemsFromExtracted(extracted: unknown): ReceiptItem[] {
  if (!extracted || typeof extracted !== "object") return [];
  const items = (extracted as { items?: unknown }).items;
  if (!Array.isArray(items)) return [];
  return items
    .map((it) => {
      if (!it || typeof it !== "object") return null;
      const o = it as Record<string, unknown>;
      return {
        description: typeof o.description === "string" ? o.description : o.description === null ? null : undefined,
        quantity: typeof o.quantity === "number" ? o.quantity : o.quantity === null ? null : undefined,
        unit_price: typeof o.unit_price === "number" ? o.unit_price : o.unit_price === null ? null : undefined,
        total: typeof o.total === "number" ? o.total : o.total === null ? null : undefined,
        iva: typeof o.iva === "number" ? o.iva : o.iva === null ? null : undefined,
        discount: typeof o.discount === "number" ? o.discount : o.discount === null ? null : undefined,
      };
    })
    .filter(Boolean) as ReceiptItem[];
}

function computeItemsSum(items: ReceiptItem[]): number {
  let sum = 0;
  let iva = 0;
  let discount = 0;
  for (const it of items) {
    const t = it.total;
    if (typeof t === "number" && Number.isFinite(t)) {
      sum += t;
    } else {
      const q = typeof it.quantity === "number" && Number.isFinite(it.quantity) ? it.quantity : null;
      const u = typeof it.unit_price === "number" && Number.isFinite(it.unit_price) ? it.unit_price : null;
      if (q !== null && u !== null) sum += q * u;
    }
    if (typeof it.iva === "number" && Number.isFinite(it.iva)) iva += it.iva;
    if (typeof it.discount === "number" && Number.isFinite(it.discount)) discount += it.discount;
  }
  return Math.round((sum + iva - discount) * 100) / 100;
}

function parseAppliedCategoryId(extracted: unknown): string | null {
  if (!extracted || typeof extracted !== "object") return null;
  const applied = (extracted as { applied?: unknown }).applied;
  if (!applied || typeof applied !== "object") return null;
  const categoryId = (applied as { category_id?: unknown }).category_id;
  return typeof categoryId === "string" ? categoryId : null;
}

function formatMoney(amount: number | null): string {
  if (amount === null || Number.isNaN(amount)) return "—";
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return String(amount);
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

export default function ReceiptsClient(props: ReceiptsClientProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [file, setFile] = useState<File | null>(null);
  const [note, setNote] = useState<string>("");

  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<{ message: string; debug?: unknown } | null>(null);
  const [isPending, startTransition] = useTransition();

  const [openBusyId, setOpenBusyId] = useState<string | null>(null);
  const [analyzeBusyId, setAnalyzeBusyId] = useState<string | null>(null);

  const [details, setDetails] = useState<{
    receipt: ReceiptRow;
    items: ReceiptItem[];
    categoryId: string;
    concept: string;
    applyAmount: number;
    imageUrl?: string | null;
    imageLoading?: boolean;
    subtotal?: number;
    iva?: number;
    discount?: number;
    total?: number;
  } | null>(null);

  const categoriesById = useMemo(() => new Map(props.categories.map((c) => [c.id, c] as const)), [props.categories]);
  const subcategories = useMemo(() => props.categories.filter((c) => Boolean(c.parent_id)), [props.categories]);

  function openDetails(r: ReceiptRow) {
    const items = parseItemsFromExtracted(r.ai_extracted);
    const extractedMerchant = r.extracted_merchant ?? r.merchant ?? "";
    const defaultConcept = `Recibo: ${extractedMerchant || r.file_name}`;
    const itemsSum = computeItemsSum(items);
    const defaultAmount = safeNum(r.extracted_total) || safeNum(r.amount) || (items.length ? itemsSum : 0);

    const appliedCategoryId = parseAppliedCategoryId(r.ai_extracted);
    const firstSub = subcategories[0]?.id ?? "";

    // Extraer desglose si existe
    const extracted = r.ai_extracted as any;
    const subtotal = typeof extracted?.subtotal === "number" ? extracted.subtotal : null;
    const iva = typeof extracted?.iva === "number" ? extracted.iva : null;
    const discount = typeof extracted?.discount === "number" ? extracted.discount : null;
    const total = typeof extracted?.total === "number" ? extracted.total : null;
    setDetails({
      receipt: r,
      items: items.length ? items : [{ description: "", quantity: null, unit_price: null, total: null, iva: null, discount: null }],
      categoryId: appliedCategoryId || firstSub,
      concept: defaultConcept,
      applyAmount: defaultAmount,
      imageUrl: null,
      imageLoading: true,
      subtotal,
      iva,
      discount,
      total,
    });

    // Load receipt image for easier editing on mobile.
    supabase.storage
      .from("domus-receipts")
      .createSignedUrl(r.file_path, 60)
      .then(({ data, error: signError }) => {
        if (signError || !data?.signedUrl) {
          setDetails((prev) => (prev?.receipt.id === r.id ? { ...prev, imageUrl: null, imageLoading: false } : prev));
          return;
        }
        setDetails((prev) => (prev?.receipt.id === r.id ? { ...prev, imageUrl: data.signedUrl, imageLoading: false } : prev));
      })
      .catch(() => {
        setDetails((prev) => (prev?.receipt.id === r.id ? { ...prev, imageUrl: null, imageLoading: false } : prev));
      });
  }

  async function applyToBudget() {
    if (!details) return;
    setError(null);
    setInfo(null);

    if (!details.categoryId) {
      setError({ message: "Selecciona una subcategoría." });
      return;
    }

    const itemsSum = computeItemsSum(details.items);
    const amount = details.items.length ? itemsSum : details.applyAmount;

    if (!amount || !Number.isFinite(amount) || amount <= 0) {
      setError({ message: "Monto inválido. Ajusta artículos o total." });
      return;
    }

    const res = await fetch(`/api/domus-receipts/${encodeURIComponent(details.receipt.id)}/apply`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        category_id: details.categoryId,
        amount,
        currency: (details.receipt.extracted_currency ?? "MXN") || "MXN",
        items: details.items,
        concept: details.concept,
      }),
    });

    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      setError({
        message: `❌ ${detailFromJson(body) || "No se pudo aplicar al presupuesto"}`,
        debug: debugFromJson(body) ?? undefined,
      });
      return;
    }

    setInfo("✅ Aplicado al presupuesto (registrado como gasto).");
    setDetails(null);
    router.refresh();
  }

  async function onUpload(e: React.FormEvent) {
    e.preventDefault();
    setInfo(null);
    setError(null);

    if (!file) {
      setError({ message: "Selecciona una imagen." });
      return;
    }

    if (!file.type || !file.type.startsWith("image/")) {
        setError({ message: "Por ahora solo imágenes (no PDF). Toma foto del recibo." });
      return;
    }

    startTransition(async () => {
      const fd = new FormData();
      fd.set("file", file);
      if (note.trim()) fd.set("note", note.trim());

      const res = await fetch("/api/domus-receipts/upload", {
        method: "POST",
        body: fd,
      });

      const body = (await res.json().catch(() => null)) as unknown;
      if (!res.ok) {
        setError({
          message: `❌ ${detailFromJson(body) || "No se pudo subir/analizar"}`,
          debug: debugFromJson(body) ?? undefined,
        });
        return;
      }

      setInfo("✅ Recibo leído con IA y guardado.");
      setFile(null);
      setNote("");

      router.refresh();
    });
  }

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

    setInfo("✅ Analizado. Revisa los campos extraídos.");
    router.refresh();
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
      <section className="card lg:col-span-2">
        <h2 className="text-lg font-semibold">Subir recibo</h2>
        <p className="mt-1 text-sm muted">
          Sube una imagen. Se analiza con IA antes de guardarse.
        </p>

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
        {info ? (
          <div className="callout callout-success mt-4">{info}</div>
        ) : null}

        <form className="mt-4 space-y-3" onSubmit={onUpload}>
          <div>
            <label className="text-sm font-medium">Archivo</label>
            <input
              className="input mt-1 w-full"
              type="file"
              accept="image/*"
              onChange={(ev) => setFile(ev.target.files?.[0] ?? null)}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Nota (opcional)</label>
            <textarea
              className="input mt-1 w-full min-h-[92px]"
              placeholder="Ej: despensa semana 3"
              value={note}
              onChange={(ev) => setNote(ev.target.value)}
              autoComplete="off"
              data-lpignore="true"
              data-1p-ignore="true"
              data-np-autofill="false"
            />
          </div>

          <button className="btn w-full" type="submit" disabled={isPending}>
            {isPending ? "Subiendo…" : "Subir recibo"}
          </button>

          <p className="text-xs muted">
            Nota: si da error, intenta con una foto más clara.
          </p>
        </form>
      </section>

              <div className="lg:col-span-3">
                {/* Lista de recibos y acciones */}
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold">Últimos recibos</h2>
                      <p className="mt-1 text-sm muted">Lista de los más recientes.</p>
                    </div>
                    <button className="btn" type="button" onClick={() => router.refresh()}>
                      Actualizar
                    </button>
                  </div>
                  <div className="mt-4 divide-y">
                    {props.initialReceipts.length === 0 ? (
                      <div className="py-8 text-sm muted">Aún no hay recibos.</div>
                    ) : (
                      props.initialReceipts.map((r) => (
                        <div key={r.id} className="flex items-center justify-between gap-4 py-4">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                              <div className="font-medium truncate">{r.file_name}</div>
                              <div className="text-sm muted">{r.receipt_date}</div>
                              <div className="text-sm">{formatMoney(r.amount)}</div>
                            </div>
                            {r.merchant ? (
                              <div className="mt-1 text-sm muted truncate">{r.merchant}</div>
                            ) : null}
                            {r.note ? (
                              <div className="mt-1 text-sm muted truncate">{r.note}</div>
                            ) : null}
                            {r.ai_status === "done" ? (
                              <div className="mt-2 text-xs muted">
                                IA: {r.extracted_merchant ?? "(sin comercio)"} · {r.extracted_date ?? "(sin fecha)"} · {formatMoney(r.extracted_total ?? null)}
                                {r.extracted_currency ? ` ${r.extracted_currency}` : ""}
                              </div>
                            ) : r.ai_status === "error" ? (
                              <div className="mt-2 text-xs text-amber-600">
                                ⚠️ IA: error (puedes reintentar)
                              </div>
                            ) : (
                              <div className="mt-2 text-xs muted">IA: pendiente</div>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-2">
                            <button className="btn" type="button" onClick={() => openDetails(r)}>
                              Detalles
                            </button>
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
                              {analyzeBusyId === r.id ? "Analizando…" : "Analizar con IA"}
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
                {/* Modal de desglose limpio */}
                {details && (
                  <div className="ticketBreakdown mb-4 p-3 rounded-xl border bg-black/5 max-h-[340px] overflow-y-auto">
                    <div className="font-semibold mb-2">Desglose</div>
                    {details.items && details.items.length > 0 ? (
                      <>
                        {details.items.map((it, idx) => {
                          const qty = it.quantity ? `x${it.quantity}` : '';
                          const desc = [it.description, qty].filter(Boolean).join(' ');
                          const { bruto } = calcLine(it);
                          return (
                            <div key={idx} className="ticketBreakdownRow flex items-center justify-between py-1 border-b last:border-b-0">
                              <div className="ticketBreakdownDesc break-words pr-2 min-w-0 text-sm" style={{lineHeight:'1.5'}}>{desc}</div>
                              <div className="ticketBreakdownPrice text-right font-mono tabular-nums min-w-[70px]">${bruto.toFixed(2)}</div>
                            </div>
                          );
                        })}
                        <div className="flex flex-col gap-1 mt-3 text-sm">
                          {(() => {
                            const { totalNeto, ivaTotal, totalBruto } = calcTicketTotals(details.items);
                            return <>
                              <div className="flex justify-between font-semibold"><span>Neto:</span><span>${totalNeto.toFixed(2)}</span></div>
                              <div className="flex justify-between font-semibold"><span>IVA:</span><span>${ivaTotal.toFixed(2)}</span></div>
                              <div className="flex justify-between font-bold text-base mt-1"><span>Total:</span><span>${totalBruto.toFixed(2)}</span></div>
                            </>;
                          })()}
                        </div>
                      </>
                    ) : (
                      <div className="text-xs muted py-4 text-center">No se detectaron artículos</div>
                    )}
                  </div>
                )}
              </div>
                {/* Se eliminan fragmentos fuera de contexto que referencian 'r' */}

      {details ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-2 sm:items-center sm:p-3">
          <div className="card w-full max-w-4xl max-h-[92vh] overflow-auto">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h3 className="text-lg font-semibold truncate">Detalle del recibo</h3>
                <div className="mt-1 text-xs muted">
                  {details.receipt.extracted_merchant ?? details.receipt.merchant ?? details.receipt.file_name} ·{" "}
                  {details.receipt.extracted_date ?? details.receipt.receipt_date}
                </div>
              </div>
              <button className="btn" type="button" onClick={() => setDetails(null)}>
                Cerrar
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-semibold">Imagen</div>
                  <button className="btn" type="button" onClick={() => openReceipt(details.receipt)}>
                    Abrir imagen
                  </button>
                </div>

                <div className="mt-2 rounded-xl border overflow-hidden" style={{ borderColor: "rgb(var(--border))" }}>
                  {details.imageLoading ? (
                    <div className="p-4 text-sm muted">Cargando imagen…</div>
                  ) : details.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={details.imageUrl} alt="Recibo" className="w-full max-h-[52vh] object-contain bg-black/5" />
                  ) : (
                    <div className="p-4 text-sm muted">No se pudo cargar la imagen.</div>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-sm font-medium">Subcategoría</label>
                    <select
                      className="input mt-1 w-full"
                      value={details.categoryId}
                      onChange={(e) => setDetails({ ...details, categoryId: e.target.value })}
                    >
                      <option value="">(Selecciona)</option>
                      {subcategories.map((c) => {
                        const parent = c.parent_id ? categoriesById.get(c.parent_id) : null;
                        const label = parent ? `${parent.name} / ${c.name}` : c.name;
                        return (
                          <option key={c.id} value={c.id}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                    <div className="mt-1 text-xs muted">Si la IA no sabe la categoría, elige una aquí.</div>
                  </div>

                  <div>
                    <label className="text-sm font-medium">Concepto</label>
                    <input
                      className="input mt-1 w-full"
                      value={details.concept}
                      onChange={(e) => setDetails({ ...details, concept: e.target.value })}
                    />
                    <div className="mt-1 text-xs muted">Se usará para registrar el gasto.</div>
                  </div>
                </div>
              </div>

              <div className="lg:col-span-3">
                {/* DESGLOSE ITEMIZADO DEL TICKET */}
                <div className="ticketBreakdown mb-4 p-3 rounded-xl border bg-black/5 max-h-[340px] overflow-y-auto">
                  <div className="font-semibold mb-2">Desglose</div>
                  {details.items && details.items.length > 0 ? (
                    <>
                      {details.items.map((it, idx) => {
                        const qty = it.quantity ? `x${it.quantity}` : '';
                        const desc = [it.description, qty].filter(Boolean).join(' ');
                        const { bruto } = calcLine(it);
                        return (
                          <div key={idx} className="ticketBreakdownRow flex items-center justify-between py-1 border-b last:border-b-0">
                            <div className="ticketBreakdownDesc break-words pr-2 min-w-0 text-sm" style={{lineHeight:'1.5'}}>{desc}</div>
                            <div className="ticketBreakdownPrice text-right font-mono tabular-nums min-w-[70px]">${bruto.toFixed(2)}</div>
                          </div>
                        );
                      })}
                      <div className="flex flex-col gap-1 mt-3 text-sm">
                        {(() => {
                          const { totalNeto, ivaTotal, totalBruto } = calcTicketTotals(details.items);
                          return <>
                            <div className="flex justify-between font-semibold"><span>Neto:</span><span>${totalNeto.toFixed(2)}</span></div>
                            <div className="flex justify-between font-semibold"><span>IVA:</span><span>${ivaTotal.toFixed(2)}</span></div>
                            <div className="flex justify-between font-bold text-base mt-1"><span>Total:</span><span>${totalBruto.toFixed(2)}</span></div>
                          </>;
                        })()}
                      </div>
                    </>
                  ) : (
                    <div className="text-xs muted py-4 text-center">No se detectaron artículos</div>
                  )}
                </div>
              </div>

              <div className="hidden">
                {/* kept for patch context */}
              </div>

              <div className="mt-2">
              </div>

            <div className="mt-6">
              <div className="flex items-end justify-between gap-4">
                <div>
                  <h4 className="text-sm font-semibold">Artículos</h4>
                  <div className="text-xs muted">Edita para que la suma cuadre.</div>
                </div>
                <button
                  className="btn"
                  type="button"
                  onClick={() =>
                    setDetails({
                      ...details,
                      items: [...details.items, { description: "", quantity: null, unit_price: null, total: null }],
                    })
                  }
                >
                  + Agregar
                </button>
              </div>

              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs muted">
                      <th className="p-2">Descripción</th>
                      <th className="p-2 w-[90px]">Cant.</th>
                      <th className="p-2 w-[120px]">Unit</th>
                      <th className="p-2 w-[120px]">Total</th>
                      <th className="p-2 w-[56px]"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {details.items.map((it, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="p-2">
                          <input
                            className="input w-full"
                            value={it.description ?? ""}
                            onChange={(e) => {
                              const next = [...details.items];
                              next[idx] = { ...next[idx], description: e.target.value };
                              setDetails({ ...details, items: next });
                            }}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            className="input w-full"
                            inputMode="decimal"
                            value={it.quantity ?? ""}
                            onChange={(e) => {
                              const v = e.target.value.trim();
                              const n = v ? Number(v) : null;
                              const next = [...details.items];
                              next[idx] = { ...next[idx], quantity: Number.isFinite(n as number) ? (n as number) : null };
                              setDetails({ ...details, items: next });
                            }}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            className="input w-full"
                            inputMode="decimal"
                            value={it.unit_price ?? ""}
                            onChange={(e) => {
                              const v = e.target.value.trim();
                              const n = v ? Number(v) : null;
                              const next = [...details.items];
                              next[idx] = { ...next[idx], unit_price: Number.isFinite(n as number) ? (n as number) : null };
                              setDetails({ ...details, items: next });
                            }}
                          />
                        </td>
                        <td className="p-2">
                          <input
                            className="input w-full"
                            inputMode="decimal"
                            value={it.total ?? ""}
                            onChange={(e) => {
                              const v = e.target.value.trim();
                              const n = v ? Number(v) : null;
                              const next = [...details.items];
                              next[idx] = { ...next[idx], total: Number.isFinite(n as number) ? (n as number) : null };
                              setDetails({ ...details, items: next });
                            }}
                          />
                        </td>
                        <td className="p-2">
                          <button
                            className="btn"
                            type="button"
                            onClick={() => {
                              const next = details.items.filter((_, i) => i !== idx);
                              setDetails({ ...details, items: next.length ? next : [{ description: "", quantity: null, unit_price: null, total: null }] });
                            }}
                            title="Eliminar"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <div className="text-sm">
                  <div className="text-xs muted">Total detectado</div>
                  <div className="font-medium">
                    {formatMoney(details.receipt.extracted_total ?? details.receipt.amount)}
                  </div>
                </div>
                <div className="text-sm">
                  <div className="text-xs muted">Suma artículos</div>
                  <div className="font-medium">{formatMoney(computeItemsSum(details.items))}</div>
                </div>
                <div className="text-sm">
                  <div className="text-xs muted">Diferencia</div>
                  <div className="font-medium">
                    {(() => {
                      const diff =
                        Math.round(
                          (computeItemsSum(details.items) - safeNum(details.receipt.extracted_total ?? details.receipt.amount)) * 100
                        ) / 100;
                      return formatMoney(diff);
                    })()}
                  </div>
                </div>
              </div>

              {(() => {
                const target = safeNum(details.receipt.extracted_total ?? details.receipt.amount);
                const sum = computeItemsSum(details.items);
                const diff = Math.round((sum - target) * 100) / 100;
                const ok = details.items.length === 0 || Math.abs(diff) <= 0.01;
                return !ok ? (
                  <div className="callout callout-warning mt-4">
                    ⚠️ La suma de artículos no cuadra con el total. Ajusta antes de aplicar.
                  </div>
                ) : null;
              })()}

              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs muted">
                  Para aplicar, la suma de artículos debe cuadrar con el total que se registrará.
                </div>
                <button
                  className="btn btn-primary"
                  type="button"
                  onClick={applyToBudget}
                  disabled={(() => {
                    const target = safeNum(details.receipt.extracted_total ?? details.receipt.amount);
                    const sum = computeItemsSum(details.items);
                    const diff = Math.round((sum - target) * 100) / 100;
                    const ok = details.items.length === 0 || Math.abs(diff) <= 0.01;
                    return isPending || !ok || !details.categoryId;
                  })()}
                >
                  Aplicar a presupuesto
                </button>
              </div>
            </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
