"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type React from "react";

type ActivityRow = {
  id: string;
  created_at: string;
  module: string;
  action: string;
  entity: string | null;
  entity_id: string | null;
  summary: string;
  metadata: Record<string, unknown> | null;
  actor_id: string | null;
  actor_name: string | null;
  actor_email: string | null;
};

function formatDateTime(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  try {
    return new Intl.DateTimeFormat("es-MX", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(d);
  } catch {
    return d.toISOString();
  }
}

function titleFromModule(module: string): string {
  const m = module.toLowerCase();
  if (m === "transactions") return "Transacciones";
  if (m === "budgets") return "Presupuestos";
  if (m === "personal_budget") return "Presupuesto Personal";
  if (m === "categories") return "Categorías";
  if (m === "receipts") return "Recibos";
  if (m === "setup") return "Setup";
  return module;
}

export type ActivityClientProps = {
  familyId: string;
  initialItems: ActivityRow[];
  needsSql: boolean;
};

export default function ActivityClient(props: ActivityClientProps) {
  const router = useRouter();
  const [items, setItems] = useState<ActivityRow[]>(props.initialItems);
  const [moduleFilter, setModuleFilter] = useState<string>("");
  const [actionFilter, setActionFilter] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const modules = useMemo(() => {
    const set = new Set(items.map((i) => i.module).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const actions = useMemo(() => {
    const set = new Set(items.map((i) => i.action).filter(Boolean));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [items]);

  const filtered = useMemo(() => {
    return items.filter((i) => {
      if (moduleFilter && i.module !== moduleFilter) return false;
      if (actionFilter && i.action !== actionFilter) return false;
      return true;
    });
  }, [items, moduleFilter, actionFilter]);

  async function refresh(e?: React.MouseEvent) {
    e?.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const url = new URL("/api/domus-activity", window.location.origin);
        url.searchParams.set("limit", "50");
        if (moduleFilter) url.searchParams.set("module", moduleFilter);
        if (actionFilter) url.searchParams.set("action", actionFilter);

        const res = await fetch(url.toString(), { method: "GET" });
        if (!res.ok) throw new Error("No se pudo cargar la actividad.");

        const body = (await res.json().catch(() => null)) as
          | { items: ActivityRow[]; needs_sql?: boolean }
          | null;

        setItems(body?.items ?? []);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error desconocido");
      }
    });
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Activity</h1>
            <p className="mt-1 text-sm muted">Seguimiento e historial de acciones en la familia</p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button className="btn" type="button" onClick={refresh} disabled={isPending}>
              {isPending ? "Actualizando..." : "Actualizar"}
            </button>
          </div>
        </div>
      </div>

      {props.needsSql ? (
        <div className="callout callout-warning">
          Falta ejecutar el SQL del módulo Activity. Ejecuta: <b>frontend/supabase/sql/09_domus_activity.sql</b>
        </div>
      ) : null}

      {error ? <div className="callout callout-danger">{error}</div> : null}

      <div className="card">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium">Módulo</label>
            <select className="input mt-1" value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}>
              <option value="">Todos</option>
              {modules.map((m) => (
                <option key={m} value={m}>
                  {titleFromModule(m)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Acción</label>
            <select className="input mt-1" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
              <option value="">Todas</option>
              {actions.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button className="btn w-full" type="button" onClick={() => { setModuleFilter(""); setActionFilter(""); }}>
              Limpiar filtros
            </button>
          </div>
        </div>
      </div>

      <div className="card">
        {!filtered.length ? (
          <div className="py-14 text-center">
            <div className="text-base font-medium">No hay actividad registrada</div>
            <div className="mt-2 text-sm muted">Cuando crees presupuestos, transacciones o recibos, aparecerán aquí.</div>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((a) => (
              <div key={a.id} className="rounded-2xl border p-4" style={{ borderColor: "rgb(var(--border))" }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{a.summary}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs muted">
                      <span className="btn" aria-label="Módulo">
                        {titleFromModule(a.module)}
                      </span>
                      <span className="btn" aria-label="Acción">
                        {a.action}
                      </span>
                      <span>{formatDateTime(a.created_at)}</span>
                      {a.actor_name || a.actor_email ? (
                        <span>
                          • {a.actor_name ?? ""}{a.actor_name && a.actor_email ? " " : ""}{a.actor_email ? `(${a.actor_email})` : ""}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
