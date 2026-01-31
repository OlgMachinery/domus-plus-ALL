"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr, type Lang } from "@/lib/i18n/client";

export default function LoginForm({ initialLang }: { initialLang: Lang }) {
  const router = useRouter();
  const lang = initialLang;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function FieldIcon({ kind }: { kind: "email" | "password" }) {
    return (
      <span
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border bg-white px-2 py-1"
        style={{ borderColor: "rgb(var(--border))" }}
        aria-hidden
      >
        {kind === "email" ? (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M4 6h16v12H4V6Z"
              stroke="#0f766e"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <path
              d="M4 7l8 6 8-6"
              stroke="#0f766e"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M7 11V8a5 5 0 0 1 10 0v3"
              stroke="#0f766e"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M6 11h12v10H6V11Z"
              stroke="#0f766e"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </span>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = (await res.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error?: string }
        | null;

      if (!res.ok || !data || ("ok" in data && data.ok === false)) {
        const message = data && "error" in data && data.error
          ? data.error
          : tr(lang, "Error iniciando sesión", "Error signing in");
        setError(message);
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl items-center justify-center px-4">
      <div className="card w-full max-w-xl" style={{ background: "#fff" }}>
        <div className="text-center">
          <div className="text-2xl font-semibold tracking-tight">DOMUS+</div>
          <div className="mt-1 text-sm muted">{tr(lang, "Inicia sesión en tu cuenta", "Sign in to your account")}</div>
        </div>

        <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{tr(lang, "Correo", "Email")}</span>
            <div className="relative">
              <input
                className="input pr-12"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
              <FieldIcon kind="email" />
            </div>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{tr(lang, "Contraseña", "Password")}</span>
            <div className="relative">
              <input
                className="input pr-12"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <FieldIcon kind="password" />
            </div>
          </label>

          {error ? <p className="text-sm alert-error">{error}</p> : null}

          <button className="btn btn-primary w-full" type="submit" disabled={loading}>
            {loading
              ? tr(lang, "Ingresando...", "Signing in...")
              : tr(lang, "Ingresar", "Sign In")}
          </button>
        </form>

        <p className="mt-5 text-center text-sm muted">
          {tr(lang, "¿No tienes cuenta?", "Don’t have an account?")}{" "}
          <Link className="underline" href="/register">
            {tr(lang, "Regístrate", "Sign up")}
          </Link>
        </p>
      </div>
    </main>
  );
}
