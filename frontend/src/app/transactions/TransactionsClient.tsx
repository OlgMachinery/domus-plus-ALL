"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type React from "react";
import { useLang, useTr, type Lang } from "@/lib/i18n/client";

type CategoryRow = {
  id: string;
  name: string;
  family_id: string | null;
  parent_id: string | null;
  sort_order: number | null;
};

type TransactionRow = {
  id: string;
  year: number;
  kind: "income" | "expense";
  amount: number;
  currency: string;
  category_id: string;
  concept: string;
  merchant: string | null;
  occurred_at: string;
  category_name: string;
  subcategory_name: string;
};

function detailFromJson(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  if (!("detail" in body)) return null;
  const value = (body as { detail?: unknown }).detail;
  return typeof value === "string" && value.trim() ? value : null;
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

export type TransactionsClientProps = {
  familyId: string;
  currentYear: number;
  initialYear: number;
  categories: CategoryRow[];
  transactions: TransactionRow[];
};

export default function TransactionsClient(props: TransactionsClientProps) {
  const router = useRouter();
  const lang = useLang();
  const t = useTr();

  const [year, setYear] = useState<number>(props.initialYear);
  const [tab, setTab] = useState<"all" | "income" | "expense">("all");
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [kind, setKind] = useState<"income" | "expense">("expense");
  const [selectedParentId, setSelectedParentId] = useState<string>("");
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string>("");
  const [concept, setConcept] = useState<string>("");
  const [merchant, setMerchant] = useState<string>("");
  const [amount, setAmount] = useState<string>("");

  const parsedAmount = useMemo(() => {
    const trimmed = (amount || "").trim();
    if (!trimmed) return null;
    const value = Number(trimmed.replace(/,/g, "."));
    return Number.isFinite(value) ? value : null;
  }, [amount]);

  const isAmountValid = parsedAmount !== null && parsedAmount > 0;

  const categoriesModel = useMemo(() => {
    const sort = (a: CategoryRow, b: CategoryRow) => {
      const ao = a.sort_order ?? 9999;
      const bo = b.sort_order ?? 9999;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name);
    };

    const parents = props.categories.filter((c) => c.parent_id === null).slice().sort(sort);
    const childrenByParent = new Map<string, CategoryRow[]>();

    for (const c of props.categories) {
      if (!c.parent_id) continue;
      const list = childrenByParent.get(c.parent_id) ?? [];
      list.push(c);
      childrenByParent.set(c.parent_id, list);
    }

    for (const [pid, list] of childrenByParent) {
      childrenByParent.set(pid, list.slice().sort(sort));
    }

    const selectedChildren = selectedParentId ? childrenByParent.get(selectedParentId) ?? [] : [];

    return {
      parents,
      selectedChildren,
    };
  }, [props.categories, selectedParentId]);

  const visibleTransactions = useMemo(() => {
    if (tab === "income") return props.transactions.filter((t) => t.kind === "income");
    if (tab === "expense") return props.transactions.filter((t) => t.kind === "expense");
    return props.transactions;
  }, [props.transactions, tab]);

  const totals = useMemo(() => {
    const income = props.transactions
      .filter((t) => t.kind === "income")
      .reduce((acc, t) => acc + Number(t.amount || 0), 0);
    const expense = props.transactions
      .filter((t) => t.kind === "expense")
      .reduce((acc, t) => acc + Number(t.amount || 0), 0);
    const net = income - expense;
    return { income, expense, net, count: props.transactions.length };
  }, [props.transactions]);

  function resetModal() {
    setKind("expense");
    setSelectedParentId("");
    setSelectedSubcategoryId("");
    setConcept("");
    setMerchant("");
    setAmount("");
    setError(null);
    setInfo(null);
  }

  async function onCreateTransaction(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!selectedParentId) {
      setError("Selecciona una categoría.");
      return;
    }

    if (!selectedSubcategoryId) {
      setError("Selecciona una subcategoría.");
      return;
    }

    if (!concept.trim()) {
      setError("La descripción es requerida");
      return;
    }

    if (!isAmountValid) {
      setError("El monto debe ser mayor a 0");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/domus-transactions", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            year,
            kind,
            category_id: selectedSubcategoryId,
            amount: parsedAmount,
            currency: "MXN",
            concept: concept.trim(),
            merchant: merchant.trim(),
          }),
        });

        const body = (await res.json().catch(() => null)) as unknown;
        if (!res.ok) {
          setError(detailFromJson(body) || t("No se pudo crear la transacción", "Could not create the transaction"));
          return;
        }

        setInfo(t("✅ Transacción creada.", "✅ Transaction created."));
        setIsOpen(false);
        resetModal();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("Error desconocido", "Unknown error"));
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("Transacciones", "Transactions")}</h1>
            <p className="mt-1 text-sm muted">{t("Gestión de ingresos y egresos", "Manage income and expenses")}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                resetModal();
                setIsOpen(true);
              }}
            >
              {t("+ Nueva Transacción", "+ New Transaction")}
            </button>
            <button className="btn" type="button" onClick={() => router.push("/receipts")}
            >
              {t("Subir Recibo", "Upload Receipt")}
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm font-medium">Filtros</div>
          <button className="btn" type="button" onClick={() => setInfo("(Pendiente) Mostrar Filtros")}
          >
            Mostrar Filtros
          </button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <button className={tab === "all" ? "btn btn-primary" : "btn"} type="button" onClick={() => setTab("all")}
            >
              Todos
            </button>
            <button
              className={tab === "income" ? "btn btn-primary" : "btn"}
              type="button"
              onClick={() => setTab("income")}
            >
              Ingreso
            </button>
            <button
              className={tab === "expense" ? "btn btn-primary" : "btn"}
              type="button"
              onClick={() => setTab("expense")}
            >
              Egreso
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm muted">Año:</span>
            <select
              className="input"
              value={String(year)}
              onChange={(e) => {
                const nextYear = Number(e.target.value);
                setYear(nextYear);
                startTransition(() => {
                  router.replace(`/transactions?year=${nextYear}`);
                });
              }}
            >
              {Array.from({ length: 6 }).map((_, idx) => {
                const y = props.currentYear - 1 + idx;
                return (
                  <option key={y} value={y}>
                    {y}
                  </option>
                );
              })}
            </select>
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
      ) : null}
      {info ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="card">
          <div className="text-sm muted">{t("Total Ingresos", "Total Income")}</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-700">{formatMoney(totals.income, "MXN", lang)}</div>
        </div>
        <div className="card">
          <div className="text-sm muted">{t("Total Egresos", "Total Expenses")}</div>
          <div className="mt-1 text-2xl font-semibold text-red-600">{formatMoney(totals.expense, "MXN", lang)}</div>
        </div>
        <div className="card">
          <div className="text-sm muted">{t("Balance Neto", "Net Balance")}</div>
          <div className="mt-1 text-2xl font-semibold">{formatMoney(totals.net, "MXN", lang)}</div>
        </div>
        <div className="card">
          <div className="text-sm muted">{t("Transacciones", "Transactions")}</div>
          <div className="mt-1 text-2xl font-semibold">{totals.count}</div>
        </div>
      </div>

      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2 text-left">{t("TIPO", "TYPE")}</th>
                <th className="p-2 text-left">{t("CATEGORÍA", "CATEGORY")}</th>
                <th className="p-2 text-left">{t("SUBCATEGORÍA", "SUBCATEGORY")}</th>
                <th className="p-2 text-left">{t("DESCRIPCIÓN", "DESCRIPTION")}</th>
                <th className="p-2 text-left">{t("MONTO", "AMOUNT")}</th>
                <th className="p-2 text-left">{t("FECHA", "DATE")}</th>
              </tr>
            </thead>
            <tbody>
              {visibleTransactions.length === 0 ? (
                <tr>
                  <td className="p-4 text-center muted" colSpan={6}>
                    {t("No hay transacciones registradas aún", "No transactions recorded yet")}
                    <div className="mt-3 flex justify-center gap-2">
                      <button
                        className="btn btn-primary"
                        type="button"
                        onClick={() => {
                          resetModal();
                          setIsOpen(true);
                        }}
                      >
                        + Crear Transacción
                      </button>
                      <button className="btn" type="button" onClick={() => router.push("/receipts")}
                      >
                        Subir Recibo
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                visibleTransactions.map((t) => (
                  <tr key={t.id} className="border-b">
                    <td className="p-2">{t.kind === "income" ? "Ingreso" : "Egreso"}</td>
                    <td className="p-2">{t.category_name}</td>
                    <td className="p-2">{t.subcategory_name}</td>
                    <td className="p-2">{t.concept}</td>
                    <td className="p-2">{formatMoney(t.amount, t.currency, lang)}</td>
                    <td className="p-2 muted">{new Date(t.occurred_at).toLocaleString()}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="text-lg font-semibold">Nueva Transacción</div>
              <button className="btn" type="button" onClick={() => setIsOpen(false)} aria-label="Cerrar">
                ✕
              </button>
            </div>

            <form className="mt-4 space-y-3" onSubmit={onCreateTransaction}>
              <div>
                <label className="text-sm font-medium">Tipo de Transacción</label>
                <select className="input mt-1 w-full" value={kind} onChange={(e) => setKind(e.target.value as "income" | "expense")}>
                  <option value="income">Ingreso</option>
                  <option value="expense">Egreso (Gasto)</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Categoría</label>
                <select
                  className="input mt-1 w-full"
                  value={selectedParentId}
                  onChange={(e) => {
                    setSelectedParentId(e.target.value);
                    setSelectedSubcategoryId("");
                  }}
                >
                  <option value="">Selecciona una categoría</option>
                  {categoriesModel.parents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Subcategoría</label>
                <select
                  className="input mt-1 w-full"
                  value={selectedSubcategoryId}
                  onChange={(e) => setSelectedSubcategoryId(e.target.value)}
                  disabled={!selectedParentId}
                >
                  <option value="">Selecciona subcategoría</option>
                  {categoriesModel.selectedChildren.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Descripción de la transacción</label>
                <input className="input mt-1 w-full" value={concept} onChange={(e) => setConcept(e.target.value)} placeholder="Ej: Supermercado" />
              </div>

              <div>
                <label className="text-sm font-medium">Comercio / Beneficiario (opcional)</label>
                <input className="input mt-1 w-full" value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Nombre" />
              </div>

              <div>
                <label className="text-sm font-medium">Monto</label>
                <input
                  className="input mt-1 w-full"
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  step={0.01}
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-invalid={amount.trim().length > 0 && !isAmountValid}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button className="btn" type="button" onClick={() => setIsOpen(false)}>
                  Cancelar
                </button>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={isPending || !selectedSubcategoryId || !concept.trim() || !isAmountValid}
                >
                  {isPending ? "Creando…" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
