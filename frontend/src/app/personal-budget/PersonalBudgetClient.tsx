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

type PersonalBudgetRow = {
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

export type PersonalBudgetClientProps = {
  familyId: string;
  currentYear: number;
  initialYear: number;
  categories: CategoryRow[];
  budgets: PersonalBudgetRow[];
};

export default function PersonalBudgetClient(props: PersonalBudgetClientProps) {
  const router = useRouter();
  const lang = useLang();
  const t = useTr();

  const [year, setYear] = useState<number>(props.initialYear);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [selectedParentId, setSelectedParentId] = useState<string>("");
  const [selectedSubcategoryId, setSelectedSubcategoryId] = useState<string>("");
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
    setAmount("");
    setCurrency("MXN");
    setError(null);
    setInfo(null);
  }

  async function onCreatePersonalBudget(e: React.FormEvent) {
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

    if (!isAmountValid) {
      setError("El monto debe ser mayor a 0");
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/domus-budgets/personal", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ year, category_id: selectedSubcategoryId, amount: parsedAmount, currency }),
        });

        const body = (await res.json().catch(() => null)) as any;
        if (!res.ok) {
          setError(detailFromJson(body) || "No se pudo crear el presupuesto");
          return;
        }

        setInfo(body?.updated ? "✅ Presupuesto personal actualizado." : "✅ Presupuesto personal creado.");
        setIsOpen(false);
        resetModal();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      }
    });
  }

  const totals = useMemo(() => {
    const total = props.budgets.reduce((acc, b) => acc + Number(b.amount || 0), 0);
    const spent = 0;
    const available = Math.max(0, total - spent);
    return { total, spent, available };
  }, [props.budgets]);

  const tableRows = useMemo(() => {
    return props.budgets
      .slice()
      .sort((a, b) => `${a.category_name}__${a.subcategory_name}`.localeCompare(`${b.category_name}__${b.subcategory_name}`));
  }, [props.budgets]);

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("Mi Presupuesto Personal", "My Personal Budget")}</h1>
            <p className="mt-1 text-sm muted">
              {t(
                "Gestiona tus presupuestos personales (colegiaturas, gasolina, reparaciones, vida social)",
                "Manage your personal budgets (school, gas, repairs, social life)",
              )}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="card">
          <div className="text-sm muted">{t("Presupuesto Total", "Total Budget")}</div>
          <div className="mt-1 text-2xl font-semibold">{formatMoney(totals.total, "MXN", lang)}</div>
        </div>
        <div className="card">
          <div className="text-sm muted">{t("Gastado", "Spent")}</div>
          <div className="mt-1 text-2xl font-semibold text-red-600">{formatMoney(totals.spent, "MXN", lang)}</div>
        </div>
        <div className="card">
          <div className="text-sm muted">{t("Disponible", "Available")}</div>
          <div className="mt-1 text-2xl font-semibold text-emerald-700">{formatMoney(totals.available, "MXN", lang)}</div>
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm muted">Año:</span>
            <select
              className="input"
              value={String(year)}
              onChange={(e) => {
                const nextYear = Number(e.target.value);
                setYear(nextYear);
                startTransition(() => {
                  router.replace(`/personal-budget?year=${nextYear}`);
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

          <button
            className="btn btn-primary"
            type="button"
            onClick={() => {
              resetModal();
              setIsOpen(true);
            }}
          >
            + Crear Presupuesto Personal
          </button>
        </div>

        {error ? (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
        ) : null}
        {info ? (
          <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{info}</div>
        ) : null}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2 text-left">CATEGORÍA</th>
                <th className="p-2 text-left">SUBCATEGORÍA</th>
                <th className="p-2 text-left">AÑO</th>
                <th className="p-2 text-left">PRESUPUESTO</th>
                <th className="p-2 text-left">GASTADO</th>
                <th className="p-2 text-left">DISPONIBLE</th>
                <th className="p-2 text-left">ACCIONES</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.length === 0 ? (
                <tr>
                  <td className="p-3 text-center muted" colSpan={7}>
                    No hay presupuestos personales
                  </td>
                </tr>
              ) : (
                tableRows.map((row) => (
                  <tr key={row.id} className="border-b">
                    <td className="p-2">{row.category_name}</td>
                    <td className="p-2">{row.subcategory_name}</td>
                    <td className="p-2">{row.year}</td>
                    <td className="p-2">{formatMoney(row.amount, row.currency, lang)}</td>
                    <td className="p-2">{formatMoney(0, row.currency, lang)}</td>
                    <td className="p-2">{formatMoney(row.amount, row.currency, lang)}</td>
                    <td className="p-2 muted">—</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold">Crear Presupuesto Personal</div>
              </div>
              <button className="btn" type="button" onClick={() => setIsOpen(false)} aria-label="Cerrar">
                ✕
              </button>
            </div>

            <form className="mt-4 space-y-3" onSubmit={onCreatePersonalBudget}>
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
                  <option value="">Selecciona categoría</option>
                  {categoriesModel.predefinedParents.length ? (
                    <optgroup label="Catálogo">
                      {categoriesModel.predefinedParents.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {categoriesModel.customParents.length ? (
                    <optgroup label="Personalizadas">
                      {categoriesModel.customParents.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
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
                <label className="text-sm font-medium">Año</label>
                <select className="input mt-1 w-full" value={String(year)} onChange={(e) => setYear(Number(e.target.value))}>
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

              <div>
                <label className="text-sm font-medium">Monto Total</label>
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
                <button className="btn btn-primary" type="submit" disabled={isPending || !selectedSubcategoryId || !isAmountValid}>
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
