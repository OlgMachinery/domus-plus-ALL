"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Person = {
  name: string;
  email?: string;
  phone?: string;
  role: "admin" | "member";
};

export default function SetupClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const force = searchParams.get("force") === "1";
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [familyName, setFamilyName] = useState("");
  const [people, setPeople] = useState<Person[]>([]);
  const [draft, setDraft] = useState<Person>({
    name: "",
    email: "",
    phone: "",
    role: "member",
  });
  const [alreadySetup, setAlreadySetup] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const canGoNext = useMemo(() => {
    if (step === 1) return familyName.trim().length > 0;
    if (step === 2) return true;
    return false;
  }, [step, familyName]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/setup/status", { cache: "no-store" });
      if (cancelled) return;

      if (res.status === 401) {
        router.push("/login");
        return;
      }

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.detail || "No se pudo cargar status");
        return;
      }

      const body = (await res.json()) as { needs_setup: boolean };
      if (!body.needs_setup) {
        setAlreadySetup(true);
        if (!force) router.push("/dashboard");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router, force]);

  function addPerson() {
    const name = draft.name.trim();
    if (!name) return;
    const email = draft.email?.trim() || undefined;
    const phone = draft.phone?.trim() || undefined;
    setPeople((prev) => [...prev, { name, email, phone, role: draft.role }]);
    setDraft({ name: "", email: "", phone: "", role: "member" });
  }

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/setup/family", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ family_name: familyName, people }),
      });

      const body = await res.json().catch(() => null);

      if (!res.ok) {
        setError(body?.detail || "No se pudo completar setup");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="card">
        <h1 className="text-2xl font-semibold tracking-tight">Setup</h1>
        <div className="mt-1 text-sm muted">Paso {step} de 3</div>

        {error ? <p className="mt-3 text-sm alert-error">{error}</p> : null}

        {alreadySetup ? (
          <p className="mt-3 text-sm muted">
            Ya existe una familia configurada. Este modo es para reconfigurar durante pruebas.
          </p>
        ) : null}
      </div>

      {step === 1 ? (
        <section className="card flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-sm">Nombre de familia</span>
            <input className="input" value={familyName} onChange={(e) => setFamilyName(e.target.value)} required />
          </label>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="card flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm">Nombre</span>
              <input className="input" value={draft.name} onChange={(e) => setDraft((p) => ({ ...p, name: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">Rol</span>
              <select
                className="select"
                value={draft.role}
                onChange={(e) => setDraft((p) => ({ ...p, role: e.target.value as Person["role"] }))}
              >
                <option value="admin">admin</option>
                <option value="member">member</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">Email (opcional)</span>
              <input className="input" type="email" value={draft.email || ""} onChange={(e) => setDraft((p) => ({ ...p, email: e.target.value }))} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm">Phone (opcional)</span>
              <input className="input" value={draft.phone || ""} onChange={(e) => setDraft((p) => ({ ...p, phone: e.target.value }))} />
            </label>
          </div>
          <button className="btn w-fit" type="button" onClick={addPerson}>
            Agregar
          </button>

          <div className="card-compact">
            <div className="text-sm font-medium">Admins / Integrantes</div>
            {people.length === 0 ? (
              <div className="mt-2 text-sm muted">(vacío)</div>
            ) : (
              <ul className="mt-2 list-disc pl-6 text-sm">
                {people.map((p, idx) => (
                  <li key={idx}>
                    {p.name} — {p.role}
                    {p.email ? ` — ${p.email}` : ""}
                    {p.phone ? ` — ${p.phone}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {step === 3 ? (
        <section className="card flex flex-col gap-4">
          <div className="card-compact">
            <div className="text-sm font-medium">Confirmación</div>
            <div className="mt-2 text-sm">Familia: {familyName || "(sin nombre)"}</div>
            <div className="mt-2 text-sm">Personas: {people.length}</div>
          </div>
          <button className="btn btn-primary w-fit" type="button" onClick={submit} disabled={loading}>
            {loading ? "Enviando..." : "Confirmar y enviar"}
          </button>
        </section>
      ) : null}

      <div className="flex flex-wrap gap-3">
        {step !== 1 ? (
          <button className="btn" type="button" onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}>
            Atrás
          </button>
        ) : null}

        {step !== 3 ? (
          <button className="btn btn-primary" type="button" onClick={() => setStep((s) => (s + 1) as 1 | 2 | 3)} disabled={!canGoNext}>
            Siguiente
          </button>
        ) : null}
      </div>
    </main>
  );
}
