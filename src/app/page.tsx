export default function Home() {
  return (
    <main className="container-page">
      <div className="card">
        <h1 className="title">DOMUS+</h1>
        <p className="subtitle">
          Núcleo de finanzas familiares. Estilo guiado por el manual: alto
          contraste, jerarquía clara, y señales semánticas (✅/⚠️/👉).
        </p>

        <div className="mt-6 space-y-3 text-sm leading-relaxed">
          <div className="callout callout-info">
            <div className="font-semibold">👉 Cómo usar el sistema</div>
            <div className="mt-1">No te saltes pasos. Si algo falla, detente y corrige antes de avanzar.</div>
          </div>

          <div className="callout callout-success">
            <div className="font-semibold">✅ Verificación</div>
            <div className="mt-1">
              Esta UI usa un solo acento (negro/blanco) y reserva color para estados: éxito, advertencia y error.
            </div>
          </div>

          <div className="callout callout-warning">
            <div className="font-semibold">⚠️ Regla de seguridad</div>
            <div className="mt-1">
              Variables tipo <span className="code">SUPABASE_SERVICE_ROLE_KEY</span> jamás deben ser{" "}
              <span className="code">NEXT_PUBLIC_*</span>.
            </div>
          </div>

          <div className="callout callout-danger">
            <div className="font-semibold">❌ Error</div>
            <div className="mt-1">Si ves un mensaje rojo, detente: no avances al siguiente paso.</div>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          <button className="btn btn-primary" type="button">
            👉 Siguiente paso
          </button>
          <button className="btn" type="button">
            ✅ Marcar verificado
          </button>
          <span className="muted ml-auto inline-flex items-center gap-2">
            Tipografía: <span className="kbd">Geist</span> + monospace para
            código
          </span>
        </div>
      </div>
    </main>
  );
}
