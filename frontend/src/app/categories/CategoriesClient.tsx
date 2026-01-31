"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type React from "react";
import { useTr } from "@/lib/i18n/client";

type CategoryRow = {
  id: string;
  name: string;
  family_id: string | null;
  parent_id: string | null;
  sort_order: number | null;
};

function detailFromJson(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  if (!("detail" in body)) return null;
  const value = (body as { detail?: unknown }).detail;
  return typeof value === "string" && value.trim() ? value : null;
}

export type CategoriesClientProps = {
  familyId: string;
  categories: CategoryRow[];
};

export default function CategoriesClient(props: CategoriesClientProps) {
  const router = useRouter();
  const t = useTr();

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"parent" | "child">("parent");
  const [name, setName] = useState<string>("");
  const [parentId, setParentId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const model = useMemo(() => {
    const sort = (a: CategoryRow, b: CategoryRow) => {
      const ao = a.sort_order ?? 9999;
      const bo = b.sort_order ?? 9999;
      if (ao !== bo) return ao - bo;
      return a.name.localeCompare(b.name);
    };

    const custom = props.categories.filter((c) => c.family_id === props.familyId);
    const parents = custom.filter((c) => c.parent_id === null).slice().sort(sort);

    const childrenByParent = new Map<string, CategoryRow[]>();
    for (const c of custom) {
      if (!c.parent_id) continue;
      const list = childrenByParent.get(c.parent_id) ?? [];
      list.push(c);
      childrenByParent.set(c.parent_id, list);
    }
    for (const [pid, list] of childrenByParent) {
      childrenByParent.set(pid, list.slice().sort(sort));
    }

    return { custom, parents, childrenByParent };
  }, [props.categories, props.familyId]);

  function openCreateParent() {
    setMode("parent");
    setName("");
    setParentId("");
    setError(null);
    setInfo(null);
    setIsOpen(true);
  }

  function openCreateChild(pid?: string) {
    setMode("child");
    setName("");
    setParentId(pid ?? "");
    setError(null);
    setInfo(null);
    setIsOpen(true);
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const trimmed = (name || "").trim();
    if (!trimmed) {
      setError(t("El nombre es requerido.", "Name is required."));
      return;
    }

    if (mode === "child" && !parentId) {
      setError(t("Selecciona una categoría padre.", "Select a parent category."));
      return;
    }

    startTransition(async () => {
      try {
        const res = await fetch("/api/domus-budgets/categories", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: trimmed,
            parent_id: mode === "child" ? parentId : null,
          }),
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as unknown;
          const detail = detailFromJson(body);
          throw new Error(detail || t("No se pudo crear la categoría.", "Could not create the category."));
        }

        setInfo(t("✅ Categoría creada.", "✅ Category created."));
        setIsOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("Error desconocido", "Unknown error"));
      }
    });
  }

  const hasCustom = model.custom.length > 0;

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t("Categorías Personalizadas", "Custom Categories")}</h1>
            <p className="mt-1 text-sm muted">
              {t(
                "Crea y gestiona tus propias categorías y subcategorías para presupuestos",
                "Create and manage your own categories and subcategories for budgets",
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button className="btn btn-primary" type="button" onClick={openCreateParent}>
              {t("+ Crear Nueva Categoría", "+ Create New Category")}
            </button>
          </div>
        </div>
      </div>

      {error ? <div className="callout callout-danger">{error}</div> : null}
      {info ? <div className="callout callout-success">{info}</div> : null}

      <div className="card">
        {!hasCustom ? (
          <div className="py-14 text-center">
            <div className="text-base font-medium">{t("No hay categorías personalizadas creadas", "No custom categories yet")}</div>
            <div className="mt-2 text-sm muted">
              {t(
                "Crea tu primera categoría personalizada para organizar mejor tus presupuestos",
                "Create your first custom category to better organize your budgets",
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-medium">{t("Tus categorías", "Your categories")}</div>
              <button className="btn" type="button" onClick={() => router.refresh()} disabled={isPending}>
                {t("Actualizar", "Refresh")}
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {model.parents.map((p) => {
                const children = model.childrenByParent.get(p.id) ?? [];
                return (
                  <div key={p.id} className="rounded-2xl border p-4" style={{ borderColor: "rgb(var(--border))" }}>
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="font-medium">{p.name}</div>
                        <div className="text-sm muted">
                          {t(
                            `${children.length} subcategoría(s)`,
                            `${children.length} subcategory(ies)`,
                          )}
                        </div>
                      </div>
                      <button className="btn" type="button" onClick={() => openCreateChild(p.id)}>
                        {t("+ Subcategoría", "+ Subcategory")}
                      </button>
                    </div>

                    {children.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {children.map((c) => (
                          <span key={c.id} className="btn" aria-label="Subcategoría">
                            {c.name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 text-sm muted">{t("Aún no has creado subcategorías.", "No subcategories yet.")}</div>
                    )}
                  </div>
                );
              })}

              {!model.parents.length ? (
                <div className="text-sm muted">{t("Crea una categoría padre para empezar.", "Create a parent category to start.")}</div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true">
          <div className="card w-full max-w-lg">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-lg font-semibold">
                  {mode === "parent"
                    ? t("Crear Nueva Categoría", "Create New Category")
                    : t("Crear Nueva Subcategoría", "Create New Subcategory")}
                </div>
                <div className="mt-1 text-sm muted">
                  {t("Solo se crearán para tu familia (personalizadas).", "These will be created only for your family (custom).")}
                </div>
              </div>
              <button className="btn" type="button" onClick={() => setIsOpen(false)} aria-label={t("Cerrar", "Close")}>
                ✕
              </button>
            </div>

            <form className="mt-5 space-y-4" onSubmit={submit}>
              <div>
                <label className="text-sm font-medium">{t("Tipo", "Type")}</label>
                <select
                  className="input mt-1"
                  value={mode}
                  onChange={(e) => setMode(e.target.value as "parent" | "child")}
                  disabled={isPending}
                >
                  <option value="parent">{t("Categoría", "Category")}</option>
                  <option value="child">{t("Subcategoría", "Subcategory")}</option>
                </select>
              </div>

              {mode === "child" ? (
                <div>
                  <label className="text-sm font-medium">{t("Categoría padre", "Parent category")}</label>
                  <select
                    className="input mt-1"
                    value={parentId}
                    onChange={(e) => setParentId(e.target.value)}
                    disabled={isPending}
                  >
                    <option value="">{t("Selecciona una categoría", "Select a category")}</option>
                    {model.parents.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              <div>
                <label className="text-sm font-medium">{t("Nombre", "Name")}</label>
                <input
                  className="input mt-1"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={
                    mode === "parent"
                      ? t("Ej: Hogar", "e.g. Home")
                      : t("Ej: Electricidad", "e.g. Electricity")
                  }
                  maxLength={80}
                  disabled={isPending}
                />
              </div>

              <div className="flex items-center justify-end gap-2">
                <button className="btn" type="button" onClick={() => setIsOpen(false)} disabled={isPending}>
                  {t("Cancelar", "Cancel")}
                </button>
                <button className="btn btn-primary" type="submit" disabled={isPending}>
                  {isPending ? t("Creando...", "Creating...") : t("Crear", "Create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
