"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function GlobalError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to console for dev + server logs.
    // eslint-disable-next-line no-console
    console.error(props.error);
  }, [props.error]);

  const isDev = process.env.NODE_ENV !== "production";

  return (
    <main className="mx-auto w-full max-w-3xl p-6">
      <div className="card">
        <h1 className="text-2xl font-semibold tracking-tight">Error</h1>
        <p className="mt-2 text-sm muted">La aplicación encontró un problema al cargar esta página.</p>

        <div className="mt-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {props.error?.message || "Error desconocido"}
        </div>

        {props.error?.digest ? <div className="mt-2 text-xs muted">Digest: {props.error.digest}</div> : null}

        {isDev && props.error?.stack ? (
          <pre className="mt-4 whitespace-pre-wrap rounded-md border p-3 text-xs" style={{ borderColor: "rgb(var(--border))" }}>
            {props.error.stack}
          </pre>
        ) : null}

        <div className="mt-5 flex flex-wrap gap-2">
          <button className="btn btn-primary" type="button" onClick={() => props.reset()}>
            Reintentar
          </button>
          <Link className="btn" href="/debug">
            Debug
          </Link>
          <Link className="btn" href="/login">
            Login
          </Link>
        </div>

        <div className="mt-4 text-xs muted">
          Tip: abre <code className="code">/api/health</code> para revisar variables de entorno.
        </div>
      </div>
    </main>
  );
}
