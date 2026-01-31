import Link from "next/link";
import { requireFamily } from "@/lib/auth/requireFamily";
import { getLangFromCookies } from "@/lib/i18n/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type TxRow = {
  id: string;
  kind: "income" | "expense";
  amount: string | number;
  currency: string;
  concept: string;
  occurred_at: string;
};

type BudgetRow = {
  amount: string | number;
  currency: string;
  category_id: string;
};

type CategoryRow = {
  id: string;
  name: string;
  parent_id: string | null;
};

function safeNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function formatMoney(amount: number, currency: string, lang: "es" | "en"): string {
  try {
    return new Intl.NumberFormat(lang === "en" ? "en-US" : "es-MX", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function formatDateTime(value: string, lang: "es" | "en"): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  try {
    return new Intl.DateTimeFormat(lang === "en" ? "en-US" : "es-MX", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

function startOfNextMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 1, 0, 0, 0, 0);
}

export default async function DashboardPage() {
  const profile = await requireFamily();
  const lang = await getLangFromCookies();
  const t = (es: string, en: string) => (lang === "en" ? en : es);

  const supabase = await createClient();
  const now = new Date();
  const monthStart = startOfMonth(now);
  const nextMonthStart = startOfNextMonth(now);
  const year = now.getFullYear();

  // Total budget: sum annual budgets for current year, shown as monthly.
  let monthlyBudget = 0;
  try {
    const { data, error } = await supabase
      .from("domus_annual_budgets")
      .select("amount,currency")
      .eq("family_id", profile.family_id)
      .eq("year", year);

    if (!error && data) {
      const annual = data.reduce((acc, r) => acc + safeNumber((r as { amount: unknown }).amount), 0);
      monthlyBudget = annual / 12;
    }
  } catch {
    // ignore (module SQL might not be applied yet)
  }

  // Spent: sum expenses for current month.
  let spentThisMonth = 0;
  try {
    const { data, error } = await supabase
      .from("domus_transactions")
      .select("kind,amount")
      .eq("family_id", profile.family_id)
      .eq("year", year)
      .gte("occurred_at", monthStart.toISOString())
      .lt("occurred_at", nextMonthStart.toISOString());

    if (!error && data) {
      spentThisMonth = data
        .filter((r) => (r as { kind: string }).kind === "expense")
        .reduce((acc, r) => acc + safeNumber((r as { amount: unknown }).amount), 0);
    }
  } catch {
    // ignore
  }

  const remaining = Math.max(0, monthlyBudget - spentThisMonth);

  // Receipts pending review: prefer ai_status if available, otherwise fallback to total active.
  let pendingReceipts = 0;
  try {
    const { count, error } = await supabase
      .from("domus_receipts")
      .select("id", { count: "exact", head: true })
      .eq("family_id", profile.family_id)
      .eq("status", "active")
      .eq("ai_status", "pending");
    if (!error && typeof count === "number") pendingReceipts = count;
    if (error) throw error;
  } catch {
    try {
      const { count } = await supabase
        .from("domus_receipts")
        .select("id", { count: "exact", head: true })
        .eq("family_id", profile.family_id)
        .eq("status", "active");
      if (typeof count === "number") pendingReceipts = count;
    } catch {
      // ignore
    }
  }

  // Recent transactions
  let recent: TxRow[] = [];
  try {
    const { data } = await supabase
      .from("domus_transactions")
      .select("id,kind,amount,currency,concept,occurred_at")
      .eq("family_id", profile.family_id)
      .eq("year", year)
      .order("occurred_at", { ascending: false })
      .limit(5);
    recent = (data ?? []) as TxRow[];
  } catch {
    // ignore
  }

  // Budget overview (top 5 annual budgets for current year)
  let budgetRows: BudgetRow[] = [];
  let categoriesById = new Map<string, CategoryRow>();
  try {
    const { data } = await supabase
      .from("domus_annual_budgets")
      .select("amount,currency,category_id")
      .eq("family_id", profile.family_id)
      .eq("year", year)
      .order("amount", { ascending: false })
      .limit(5);
    budgetRows = (data ?? []) as BudgetRow[];

    const categoryIds = Array.from(new Set(budgetRows.map((b) => b.category_id).filter(Boolean)));
    if (categoryIds.length) {
      const { data: cats } = await supabase
        .from("domus_budget_categories")
        .select("id,name,parent_id")
        .in("id", categoryIds);
      for (const c of (cats ?? []) as CategoryRow[]) categoriesById.set(c.id, c);

      const parentIds = Array.from(
        new Set((cats ?? []).map((c: any) => c.parent_id).filter(Boolean))
      ) as string[];
      if (parentIds.length) {
        const { data: parents } = await supabase
          .from("domus_budget_categories")
          .select("id,name,parent_id")
          .in("id", parentIds);
        for (const p of (parents ?? []) as CategoryRow[]) categoriesById.set(p.id, p);
      }
    }
  } catch {
    // ignore
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm muted">{t("Bienvenido de vuelta", "Welcome back")}, {profile.name}</p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Link href="/budgets" className="card" aria-label={t("Ir a presupuestos", "Go to budgets")}>
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">{t("Presupuesto total", "Total budget")}</div>
            <div className="text-xs muted">⎘</div>
          </div>
          <div className="mt-4 text-3xl font-semibold">{formatMoney(monthlyBudget, "MXN", lang)}</div>
          <div className="mt-1 text-sm muted">{t("Este mes", "This month")}</div>
        </Link>

        <Link href="/transactions" className="card" aria-label={t("Ir a transacciones", "Go to transactions")}>
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">{t("Gastado", "Spent")}</div>
            <div className="text-xs muted">—</div>
          </div>
          <div className="mt-4 text-3xl font-semibold">{formatMoney(spentThisMonth, "MXN", lang)}</div>
          <div className="mt-1 text-sm muted">{t("Este mes", "This month")}</div>
        </Link>

        <Link href="/budgets" className="card" aria-label={t("Ver disponible", "View remaining") }>
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">{t("Restante", "Remaining")}</div>
            <div className="text-xs muted">↗</div>
          </div>
          <div className="mt-4 text-3xl font-semibold">{formatMoney(remaining, "MXN", lang)}</div>
          <div className="mt-1 text-sm muted">{t("Disponible", "Available")}</div>
        </Link>

        <Link href="/receipts" className="card" aria-label={t("Ir a recibos", "Go to receipts")}>
          <div className="flex items-center justify-between">
            <div className="text-sm font-medium">{t("Recibos", "Receipts")}</div>
            <div className="text-xs muted">$</div>
          </div>
          <div className="mt-4 text-3xl font-semibold">{pendingReceipts}</div>
          <div className="mt-1 text-sm muted">{t("Pendientes de revisión", "Pending review")}</div>
        </Link>
      </section>

      <section className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-semibold">{t("Transacciones recientes", "Recent transactions")}</div>
              <div className="mt-1 text-sm muted">{t("Tu actividad más reciente", "Your latest activity")}</div>
            </div>
            <Link className="btn" href="/transactions">{t("Ver todo", "View all")}</Link>
          </div>

          {!recent.length ? (
            <div className="mt-6 text-sm muted">{t("Aún no hay transacciones", "No transactions yet")}</div>
          ) : (
            <div className="mt-4 space-y-2">
              {recent.map((tx) => (
                <div key={tx.id} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2" style={{ borderColor: "rgb(var(--border))" }}>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{tx.concept}</div>
                    <div className="text-xs muted">{formatDateTime(tx.occurred_at, lang)}</div>
                  </div>
                  <div className={tx.kind === "expense" ? "text-sm font-semibold text-red-600" : "text-sm font-semibold text-emerald-700"}>
                    {tx.kind === "expense" ? "-" : "+"}{formatMoney(safeNumber(tx.amount), tx.currency || "MXN", lang)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-base font-semibold">{t("Resumen de presupuestos", "Budget overview")}</div>
              <div className="mt-1 text-sm muted">{t("Distribución anual (top)", "Top annual distribution")}</div>
            </div>
            <Link className="btn" href="/budgets">{t("Ver todo", "View all")}</Link>
          </div>

          {!budgetRows.length ? (
            <div className="mt-6 text-sm muted">{t("No hay presupuestos configurados", "No budgets configured")}</div>
          ) : (
            <div className="mt-4 space-y-2">
              {budgetRows.map((b) => {
                const cat = categoriesById.get(b.category_id);
                const parent = cat?.parent_id ? categoriesById.get(cat.parent_id) : null;
                const label = parent ? `${parent.name} / ${cat?.name ?? ""}` : (cat?.name ?? t("Categoría", "Category"));
                return (
                  <div key={b.category_id} className="flex items-center justify-between gap-3 rounded-xl border px-3 py-2" style={{ borderColor: "rgb(var(--border))" }}>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{label}</div>
                      <div className="text-xs muted">{t("Anual", "Annual")}</div>
                    </div>
                    <div className="text-sm font-semibold">{formatMoney(safeNumber(b.amount), b.currency || "MXN", lang)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="flex flex-wrap gap-2">
        <Link className="btn" href="/setup?force=1">
          {t("Configuración", "Setup")}
        </Link>
        <Link className="btn" href="/bank">
          {t("Banco Domus", "Domus Bank")}
        </Link>
      </section>
    </main>
  );
}
