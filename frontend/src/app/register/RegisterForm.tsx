"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { tr, type Lang } from "@/lib/i18n/client";

export default function RegisterForm({ initialLang }: { initialLang: Lang }) {
  const router = useRouter();
  const lang = initialLang;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function FieldIcon({ kind }: { kind: "text" | "email" | "password" | "phone" }) {
    const icon = (() => {
      if (kind === "email") {
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M4 6h16v12H4V6Z" stroke="#0f766e" strokeWidth="2" strokeLinejoin="round" />
            <path d="M4 7l8 6 8-6" stroke="#0f766e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        );
      }
      if (kind === "password") {
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M7 11V8a5 5 0 0 1 10 0v3" stroke="#0f766e" strokeWidth="2" strokeLinecap="round" />
            <path d="M6 11h12v10H6V11Z" stroke="#0f766e" strokeWidth="2" strokeLinejoin="round" />
          </svg>
        );
      }
      if (kind === "phone") {
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M6 3h7l2 5-3 2a14 14 0 0 0 6 6l2-3 5 2v7c0 1-1 2-2 2-11 0-20-9-20-20 0-1 1-2 2-2Z"
              stroke="#0f766e"
              strokeWidth="2"
              strokeLinejoin="round"
            />
          </svg>
        );
      }
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path
            d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
            stroke="#0f766e"
            strokeWidth="2"
            strokeLinecap="round"
          />
          <path
            d="M12 11a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z"
            stroke="#0f766e"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    })();

    return (
      <span
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 rounded-lg border bg-white px-2 py-1"
        style={{ borderColor: "rgb(var(--border))" }}
        aria-hidden
      >
        {icon}
      </span>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
          name,
          phone,
        }),
      });

      const data = (await res.json().catch(() => null)) as
        | { ok: true }
        | { ok: false; error?: string }
        | null;

      if (!res.ok || !data || ("ok" in data && data.ok === false)) {
        const message = data && "error" in data && data.error
          ? data.error
          : tr(lang, "Error creando usuario", "Error creating account");
        setError(message);
        return;
      }

      router.push("/login");
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
          <div className="mt-1 text-sm muted">{tr(lang, "Crea tu cuenta", "Create your account")}</div>
        </div>

        <form className="mt-6 flex flex-col gap-4" onSubmit={onSubmit}>
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{tr(lang, "Nombre", "Name")}</span>
            <div className="relative">
              <input
                className="input pr-12"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={tr(lang, "Tu nombre", "Your name")}
                required
              />
              <FieldIcon kind="text" />
            </div>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">{tr(lang, "Teléfono", "Phone")}</span>
            <div className="relative">
              <input
                className="input pr-12"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder={tr(lang, "Opcional", "Optional")}
              />
              <FieldIcon kind="phone" />
            </div>
          </label>

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
              ? tr(lang, "Creando...", "Creating...")
              : tr(lang, "Crear cuenta", "Create account")}
          </button>
        </form>

        <p className="mt-5 text-center text-sm muted">
          {tr(lang, "¿Ya tienes cuenta?", "Already have an account?")}{" "}
          <Link className="underline" href="/login">
            {tr(lang, "Ingresar", "Sign in")}
          </Link>
        </p>
      </div>
    </main>
  );
}
