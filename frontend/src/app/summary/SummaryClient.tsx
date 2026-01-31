"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

export type SummaryBudgetRow = {
  id: string;
  year: number;
  amount: number;
  currency: string;
  category_id: string;
  category_name: string;
  subcategory_name: string;
  spent: number;
};

export type SummaryClientProps = {
  currentYear: number;
  initialYear: number;
  budgets: SummaryBudgetRow[];
};

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount} ${currency}`;
  }
}

export default function SummaryClient(props: SummaryClientProps) {
  const router = useRouter();
  const [year, setYear] = useState<number>(props.initialYear);
  const [isPending, startTransition] = useTransition();

  const currency = props.budgets[0]?.currency ?? "MXN";

  const totals = useMemo(() => {
    const annualBudget = props.budgets.reduce((acc, b) => acc + Number(b.amount || 0), 0);
    const spent = props.budgets.reduce((acc, b) => acc + Number(b.spent || 0), 0);
    const remaining = annualBudget - spent;
    const monthlyAverage = annualBudget / 12;
    const utilization = annualBudget > 0 ? (spent / annualBudget) * 100 : 0;
    return {
      annualBudget,
      monthlyAverage,
      spent,
      remaining,
      utilization,
      accounts: props.budgets.length,
    };
  }, [props.budgets]);

  const rows = useMemo(() => {
    return props.budgets.map((b) => {
      const remaining = Number(b.amount || 0) - Number(b.spent || 0);
      const status = b.spent <= 0 ? "Pending" : remaining <= 0 ? "Over" : "Active";
      return { ...b, remaining, status };
    });
  }, [props.budgets]);

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Budget Summary</h1>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="input"
              value={String(year)}
              onChange={(e) => {
                const nextYear = Number(e.target.value);
                setYear(nextYear);
                startTransition(() => {
                  router.replace(`/summary?year=${nextYear}`);
                });
              }}
              aria-label="Year"
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
            <div className="avatar" title="Usuario" aria-label="Usuario">
              UT
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <div className="card">
          <div className="text-sm muted">Annual Budget</div>
          <div className="mt-2 text-2xl font-semibold">{formatMoney(totals.annualBudget, currency)}</div>
          <div className="mt-1 text-xs muted">{totals.accounts} accounts</div>
        </div>
        <div className="card">
          <div className="text-sm muted">Monthly Average</div>
          <div className="mt-2 text-2xl font-semibold">{formatMoney(totals.monthlyAverage, currency)}</div>
          <div className="mt-1 text-xs muted">Per month</div>
        </div>
        <div className="card">
          <div className="text-sm muted">Spent</div>
          <div className="mt-2 text-2xl font-semibold text-emerald-700">{formatMoney(totals.spent, currency)}</div>
          <div className="mt-1 text-xs muted">{totals.utilization.toFixed(0)}% utilized</div>
        </div>
        <div className="card">
          <div className="text-sm muted">Remaining</div>
          <div className="mt-2 text-2xl font-semibold text-orange-600">{formatMoney(totals.remaining, currency)}</div>
          <div className="mt-1 text-xs muted">Available</div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Budget Accounts</h2>
          {isPending ? <span className="text-sm muted">Cargando…</span> : null}
        </div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2 text-left">Category</th>
                <th className="p-2 text-left">Budget</th>
                <th className="p-2 text-left">Spent</th>
                <th className="p-2 text-left">Remaining</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-left">Type</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td className="p-4 text-center muted" colSpan={6}>
                    No budgets found for this year
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const statusClass =
                    r.status === "Pending"
                      ? "bg-slate-100 text-slate-700"
                      : r.status === "Over"
                        ? "bg-red-100 text-red-700"
                        : "bg-emerald-100 text-emerald-800";

                  return (
                    <tr key={r.id} className="border-b">
                      <td className="p-2">
                        <div className="font-medium">{r.category_name}</div>
                        <div className="text-xs muted">{r.subcategory_name}</div>
                      </td>
                      <td className="p-2 font-medium">{formatMoney(r.amount, r.currency)}</td>
                      <td className="p-2 text-emerald-700">{formatMoney(r.spent, r.currency)}</td>
                      <td className="p-2 text-orange-600">{formatMoney(r.remaining, r.currency)}</td>
                      <td className="p-2">
                        <span className={`rounded-full px-2 py-1 text-xs font-medium ${statusClass}`}>{r.status}</span>
                      </td>
                      <td className="p-2">
                        <span className="rounded-full border px-2 py-1 text-xs">Shared</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
