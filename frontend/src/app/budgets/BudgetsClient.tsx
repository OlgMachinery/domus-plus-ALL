"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLang, useTr, type Lang } from "@/lib/i18n/client";

type CategoryRow = {
  id: string;
  name: string;
  family_id: string | null;
  parent_id: string | null;
  sort_order: number | null;
};

type BudgetRow = {
  id: string;
  year: number;
  amount: number;
  currency: string;
  category_id: string;
  category_name: string;
  subcategory_name: string;
  is_common: boolean;
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

export type BudgetsClientProps = {
  familyId: string;
  currentYear: number;
  initialYear: number;
  categories: CategoryRow[];
  budgets: BudgetRow[];
};

export default function BudgetsClient(props: BudgetsClientProps) {
  const router = useRouter();
  const lang = useLang();
  const t = useTr();

  const [year, setYear] = useState<number>(props.initialYear);
  const [isOpen, setIsOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [selectedParentId, setSelectedParentId] = useState<string>("");
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string>("");
  const [newSubcategoryName, setNewSubcategoryName] = useState<string>("");
  const [amount, setAmount] = useState<string>("");
  const [currency, setCurrency] = useState<string>("MXN");

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

    const parentById = new Map(parents.map((p) => [p.id, p] as const));
    const selectedChildren = selectedParentId ? childrenByParent.get(selectedParentId) ?? [] : [];

    const predefinedParents = parents.filter((p) => p.family_id === null);
    const customParents = parents.filter((p) => p.family_id !== null);

    return {
      parents,
      predefinedParents,
      customParents,
      childrenByParent,
      parentById,
      selectedChildren,
    };
  }, [props.categories, selectedParentId]);

  function resetModal() {
    setSelectedParentId("");
    setSelectedSubcategoryId("");
    setNewSubcategoryName("");
    setAmount("");
    setCurrency("MXN");
    setError(null);
    setInfo(null);
  }

  async function createSubcategoryIfNeeded(parentId: string): Promise<string | null> {
    const name = newSubcategoryName.trim();
    if (!name) return null;

    const res = await fetch("/api/domus-budgets/categories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, parent_id: parentId }),
    });

    const body = (await res.json().catch(() => null)) as unknown;
    if (!res.ok) {
      throw new Error(detailFromJson(body) || "No se pudo crear la categoría");
    }

    const id = (body as { id?: unknown }).id;
    if (typeof id !== "string" || !id) {
      throw new Error("Respuesta inválida al crear categoría");
    }
    return id;
  }

  async function onCreateBudget(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!isAmountValid) {
      setError("El monto debe ser mayor a 0");
      return;
    }

    startTransition(async () => {
      try {
        if (!selectedParentId) {
          setError("Selecciona una categoría.");
          return;
        }

        const subcategoryId = (await createSubcategoryIfNeeded(selectedParentId)) || selectedSubcategoryId;
        if (!subcategoryId) {
          setError("Selecciona una subcategoría o crea una nueva.");
          return;
        }

        const res = await fetch("/api/domus-budgets/annual", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ year, category_id: subcategoryId, amount: parsedAmount, currency }),
        });

        const body = (await res.json().catch(() => null)) as unknown;
        if (!res.ok) {
          setError(detailFromJson(body) || "No se pudo crear el presupuesto");
          return;
        }

        setInfo(t("✅ Presupuesto creado.", "✅ Budget created."));
        setIsOpen(false);
        resetModal();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("Error desconocido", "Unknown error"));
      }
    });
  }

  const tableRows = useMemo(() => {
    const rows = props.budgets
      .slice()
      .sort((a, b) =>
        `${a.category_name}__${a.subcategory_name}`.localeCompare(`${b.category_name}__${b.subcategory_name}`)
      )
      .map((b) => {
        const annual = Number(b.amount);
        const monthly = annual / 12;
        const assigned = 0;
        const spent = 0;
        const available = Math.max(0, annual - spent);
        const pct = annual > 0 ? Math.min(100, Math.max(0, (spent / annual) * 100)) : 0;
        return { ...b, annual, monthly, assigned, spent, available, pct };
      });
    return rows;
  }, [props.budgets]);

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("Presupuestos Familiares", "Family Budgets")}</h1>
            <p className="mt-1 text-sm muted">{t("Gestión de presupuestos comunes e individuales", "Manage common and individual budgets")}</p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button className="btn" type="button" onClick={() => setShowFilters((v) => !v)}>
              {showFilters ? t("Ocultar Filtros", "Hide filters") : t("Mostrar Filtros", "Show filters")}
            </button>
            <button className="btn" type="button" onClick={() => router.refresh()}>
              {t("Actualizar", "Refresh")}
            </button>
            <button className="btn" type="button" onClick={() => setInfo("(Pendiente) Resumen Global")}
            >
              {t("Mostrar Filtros Resumen Global", "Show global summary filters")}
            </button>
            <button className="btn" type="button" onClick={() => setInfo("(Pendiente) Matriz Anual")}
            >
              {t("Matriz Anual", "Annual matrix")}
            </button>
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => {
                resetModal();
                setIsOpen(true);
              }}
            >
              {t("+ Crear Presupuesto", "+ Create Budget")}
            </button>
          </div>
        </div>
      </div>

      {showFilters ? (
        <div className="card">
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">Filtros</div>
            <button className="btn" type="button" onClick={() => setShowFilters(false)}>
              Mostrar Filtros
            </button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm muted">Año:</span>
              <select
                className="input"
                value={String(year)}
                onChange={(e) => {
                  const nextYear = Number(e.target.value);
                  setYear(nextYear);
                  startTransition(() => {
                    router.replace(`/budgets?year=${nextYear}`);
                  });
                }}
              >
                {Array.from({ length: 5 }).map((_, i) => {
                  const y = props.currentYear - 2 + i;
                  return (
                    <option key={y} value={String(y)}>
                      {y}
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </div>
      ) : null}

      {error ? <div className="callout callout-error">❌ {error}</div> : null}
      {info ? <div className="callout callout-success">{info}</div> : null}

      <div className="card">
        <div className="text-sm muted mb-3">Presupuestos del año {year}</div>
        {tableRows.length === 0 ? (
          <div className="text-sm muted py-8">Aún no hay presupuestos para este año.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: "rgb(var(--border))" }}>
                  <th className="text-left py-3 pr-4 text-xs uppercase muted">Categoría</th>
                  <th className="text-left py-3 pr-4 text-xs uppercase muted">Subcategoría</th>
                  <th className="text-right py-3 pl-4 text-xs uppercase muted">Mensual</th>
                  <th className="text-right py-3 pl-4 text-xs uppercase muted">Anual</th>
                  <th className="text-right py-3 pl-4 text-xs uppercase muted">Asignado</th>
                  <th className="text-right py-3 pl-4 text-xs uppercase muted">Gastado</th>
                  <th className="text-right py-3 pl-4 text-xs uppercase muted">Disponible</th>
                  <th className="text-right py-3 pl-1 text-xs uppercase muted">%</th>
                </tr>
              </thead>
              <tbody className="divide-y" style={{ borderColor: "rgb(var(--border))" }}>
                {tableRows.map((r) => (
                  <tr key={r.id}>
                    <td className="py-4 pr-4">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-medium truncate">{r.category_name}</span>
                        <span
                          className="inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{
                            borderColor: "rgb(var(--border))",
                            color: "rgb(var(--muted))",
                            background: "rgb(var(--background))",
                          }}
                          title={r.is_common ? "Común" : "Personalizada"}
                        >
                          {r.is_common ? "C" : "P"}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 pr-4 muted">{r.subcategory_name}</td>
                    <td className="py-4 pl-4 text-right">{formatMoney(r.monthly, r.currency, lang)}</td>
                    <td className="py-4 pl-4 text-right font-medium">{formatMoney(r.annual, r.currency, lang)}</td>
                    <td className="py-4 pl-4 text-right muted">{formatMoney(r.assigned, r.currency, lang)}</td>
                    <td className="py-4 pl-4 text-right muted">{formatMoney(r.spent, r.currency, lang)}</td>
                    <td className="py-4 pl-4 text-right" style={{ color: "rgb(var(--success))" }}>
                      {formatMoney(r.available, r.currency, lang)}
                    </td>
                    <td className="py-4 pl-1 text-right muted">{r.pct.toFixed(0)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsOpen(false)}
          />
          <div className="relative w-full max-w-xl card">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Crear Presupuesto Anual</div>
                <div className="text-sm muted">Paso 1: Selecciona la cuenta del catálogo</div>
              </div>
              <button className="btn" type="button" onClick={() => setIsOpen(false)}>
                ✕
              </button>
            </div>

            <form className="mt-4 space-y-3" onSubmit={onCreateBudget}>
              <div>
                <label className="text-sm font-medium">Categoría</label>
                <div className="mt-1 flex gap-2">
                  <select
                    className="input w-full"
                    value={selectedParentId}
                    onChange={(e) => {
                      setSelectedParentId(e.target.value);
                      setSelectedSubcategoryId("");
                      setNewSubcategoryName("");
                    }}
                  >
                    <option value="">Selecciona una categoría</option>
                    <optgroup label="Categorías Predefinidas">
                      {categoriesModel.predefinedParents.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Categorías Personalizadas">
                      {categoriesModel.customParents.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Subcategoría</label>
                <div className="mt-1 flex gap-2">
                  <select
                    className="input w-full"
                    value={selectedSubcategoryId}
                    onChange={(e) => setSelectedSubcategoryId(e.target.value)}
                    disabled={!selectedParentId}
                  >
                    <option value="">Selecciona una subcategoría</option>
                    {categoriesModel.selectedChildren.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn"
                    type="button"
                    onClick={() => {
                      if (!selectedParentId) return;
                      setSelectedSubcategoryId("");
                      const el = document.getElementById("newSubcategoryInput") as HTMLInputElement | null;
                      el?.focus();
                    }}
                    disabled={!selectedParentId}
                    title="Crear una subcategoría"
                  >
                    + Nueva
                  </button>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Nueva subcategoría (opcional)</label>
                <input
                  id="newSubcategoryInput"
                  className="input mt-1 w-full"
                  placeholder="Ej: Electricidad CFE"
                  value={newSubcategoryName}
                  onChange={(e) => setNewSubcategoryName(e.target.value)}
                  autoComplete="off"
                  disabled={!selectedParentId}
                />
                <p className="mt-1 text-xs muted">Si llenas esto, se creará una subcategoría personalizada.</p>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium">Año</label>
                  <input className="input mt-1 w-full" value={String(year)} readOnly />
                </div>
                <div>
                  <label className="text-sm font-medium">Moneda</label>
                  <select
                    className="input mt-1 w-full"
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    <option value="MXN">MXN</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Monto anual</label>
                <input
                  className="input mt-1 w-full"
                  type="number"
                  inputMode="decimal"
                  min={0.01}
                  step={0.01}
                  placeholder="Ej: 12000"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  aria-invalid={amount.trim().length > 0 && !isAmountValid}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button className="btn" type="button" onClick={() => setIsOpen(false)}>
                  Cancelar
                </button>
                <button className="btn btn-primary" type="submit" disabled={isPending || !isAmountValid}>
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
