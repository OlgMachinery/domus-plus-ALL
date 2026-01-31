import { Suspense } from "react";
import SetupClient from "./SetupClient";

export default function SetupPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto flex w-full max-w-3xl flex-col gap-6">
          <div className="card">
            <h1 className="text-2xl font-semibold tracking-tight">Setup</h1>
            <p className="mt-2 text-sm muted">Cargando…</p>
          </div>
        </main>
      }
    >
      <SetupClient />
    </Suspense>
  );
}
