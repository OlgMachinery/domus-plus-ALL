"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { LangProvider, normalizeLang, tr, type Lang } from "@/lib/i18n/client";

type NavItem = {
  href: string;
  label: string;
  icon: React.ReactNode;
};

function Icon({
  name,
}: {
  name:
    | "dashboard"
    | "budgets"
    | "personal"
    | "transactions"
    | "summary"
    | "receipts"
    | "records"
    | "reports"
    | "categories"
    | "activity";
}) {
  const common = {
    className: "h-4 w-4",
    viewBox: "0 0 24 24",
    fill: "none",
    xmlns: "http://www.w3.org/2000/svg",
  } as const;

  switch (name) {
    case "dashboard":
      return (
        <svg {...common}>
          <path d="M4 13h7V4H4v9Z" stroke="currentColor" strokeWidth="2" />
          <path d="M13 20h7V11h-7v9Z" stroke="currentColor" strokeWidth="2" />
          <path d="M13 9h7V4h-7v5Z" stroke="currentColor" strokeWidth="2" />
          <path d="M4 20h7v-5H4v5Z" stroke="currentColor" strokeWidth="2" />
        </svg>
      );
    case "budgets":
      return (
        <svg {...common}>
          <path
            d="M4 7h16M4 12h16M4 17h10"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "personal":
      return (
        <svg {...common}>
          <path
            d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Zm7 10a7 7 0 1 0-14 0"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case "transactions":
      return (
        <svg {...common}>
          <path
            d="M7 7h14M7 17h14M3 7l2-2v4L3 7Zm0 10 2-2v4l-2-2Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "summary":
      return (
        <svg {...common}>
          <path d="M5 19V5h14" stroke="currentColor" strokeWidth="2" />
          <path
            d="M7 15l3-4 3 2 4-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "receipts":
      return (
        <svg {...common}>
          <path
            d="M7 3h10v18l-2-1-3 1-3-1-2 1V3Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path d="M9 8h6M9 12h6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "records":
      return (
        <svg {...common}>
          <path
            d="M6 4h12v16H6V4Z"
            stroke="currentColor"
            strokeWidth="2"
          />
          <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "reports":
      return (
        <svg {...common}>
          <path d="M4 20V4h16" stroke="currentColor" strokeWidth="2" />
          <path d="M8 16V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M12 16V6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <path d="M16 16v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "categories":
      return (
        <svg {...common}>
          <path
            d="M4 7h7v7H4V7Zm9 0h7v7h-7V7ZM4 16h7v4H4v-4Zm9 0h7v4h-7v-4Z"
            stroke="currentColor"
            strokeWidth="2"
          />
        </svg>
      );
    case "activity":
      return (
        <svg {...common}>
          <path
            d="M4 12h4l2-6 4 12 2-6h4"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
  }
}

function initialsFromEmail(email: string | null | undefined) {
  const v = (email || "").trim();
  if (!v) return "U";
  const base = v.includes("@") ? v.split("@")[0] : v;
  const parts = base.split(/[._\-\s]+/).filter(Boolean);
  const letters = (parts.length ? parts : [base])
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .filter(Boolean)
    .join("");
  return letters || "U";
}

export function AppShell({
  children,
  initialLang,
}: {
  children: React.ReactNode;
  initialLang?: Lang;
}) {
  const pathname = usePathname() || "/";

  const isAuthPage = pathname.startsWith("/login") || pathname.startsWith("/register");

  const [lang, setLang] = useState<Lang>(() => normalizeLang(initialLang));
  const [email, setEmail] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const setLangEverywhere = (next: Lang) => {
    setLang(next);
    try {
      window.localStorage.setItem("domus_lang", next);
    } catch {
      // ignore
    }
    try {
      document.cookie = `domus_lang=${next}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // ignore
    }
    try {
      document.documentElement.lang = next;
    } catch {
      // ignore
    }
  };

  const nav: NavItem[] = [
    { href: "/dashboard", label: tr(lang, "Dashboard", "Dashboard"), icon: <Icon name="dashboard" /> },
    { href: "/budgets", label: tr(lang, "Presupuestos", "Budgets"), icon: <Icon name="budgets" /> },
    { href: "/personal-budget", label: tr(lang, "Presupuesto Personal", "Personal Budget"), icon: <Icon name="personal" /> },
    { href: "/transactions", label: tr(lang, "Transacciones", "Transactions"), icon: <Icon name="transactions" /> },
    { href: "/summary", label: tr(lang, "Resumen", "Summary"), icon: <Icon name="summary" /> },
    { href: "/receipts", label: tr(lang, "Recibos", "Receipts"), icon: <Icon name="receipts" /> },
    { href: "/records", label: tr(lang, "Registros", "Records"), icon: <Icon name="records" /> },
    { href: "/reports", label: tr(lang, "Reportes", "Reports"), icon: <Icon name="reports" /> },
    { href: "/categories", label: tr(lang, "Categorías", "Categories"), icon: <Icon name="categories" /> },
    { href: "/activity", label: tr(lang, "Actividad", "Activity"), icon: <Icon name="activity" /> },
  ];

  const initials = useMemo(() => {
    // Match screenshot default (UT) if we can't infer.
    return email ? initialsFromEmail(email) : "UT";
  }, [email]);

  const displayName = useMemo(() => {
    if (!email) return tr(lang, "Usuario", "User");
    const base = email.includes("@") ? email.split("@")[0] : email;
    const cleaned = base.replace(/[._\-]+/g, " ").trim();
    if (!cleaned) return tr(lang, "Usuario", "User");
    return cleaned
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" ");
  }, [email, lang]);

  useEffect(() => {
    if (isAuthPage) return;
    try {
      const stored = window.localStorage.getItem("domus_lang");
      if (stored === "en" || stored === "es") {
        const next = normalizeLang(stored);
        if (next !== lang) setLangEverywhere(next);
      }
    } catch {
      // ignore
    }

    const supabase = createClient();
    supabase.auth
      .getUser()
      .then(({ data }) => {
        setEmail(data.user?.email ?? null);
      })
      .catch(() => {
        // ignore
      });
  }, [isAuthPage]);

  useEffect(() => {
    if (isAuthPage) return;
    // Ensure cookie + document lang stay in sync even when state comes from SSR.
    setLangEverywhere(lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthPage]);

  useEffect(() => {
    if (!menuOpen) return;
    const onMouseDown = (ev: MouseEvent) => {
      const el = menuRef.current;
      if (!el) return;
      if (ev.target instanceof Node && el.contains(ev.target)) return;
      setMenuOpen(false);
    };
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    // Close mobile nav when navigating.
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") setMobileNavOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileNavOpen]);

  // Auth pages should be distraction-free.
  if (isAuthPage) {
    return <>{children}</>;
  }

  async function toggleLang() {
    const next = lang === "es" ? "en" : "es";
    setLangEverywhere(next);
  }

  async function logout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  return (
    <LangProvider lang={lang}>
      <div className={mobileNavOpen ? "app-shell sidebar-open" : "app-shell"}>
      {mobileNavOpen ? (
        <div
          className="sidebar-overlay"
          role="presentation"
          onClick={() => setMobileNavOpen(false)}
        />
      ) : null}

      <aside className="sidebar" aria-label={tr(lang, "Navegación", "Navigation")}>
        <div className="sidebar-brand">
          <div className="brand-mark">D+</div>
          <div className="brand-text">DOMUS+</div>

          <button
            className="btn btn-icon btn-mobile ml-auto"
            type="button"
            aria-label={tr(lang, "Cerrar menú", "Close menu")}
            onClick={() => setMobileNavOpen(false)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <path d="M18 6 6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Main">
          {nav.map((item) => {
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href + "/"));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={active ? "nav-item nav-item-active" : "nav-item"}
                onClick={() => setMobileNavOpen(false)}
              >
                <span className="nav-icon" aria-hidden>
                  {item.icon}
                </span>
                <span className="nav-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="app-main">
        <header className="app-topbar">
          <div className="flex items-center gap-2">
            <button
              className="btn btn-icon btn-mobile"
              type="button"
              aria-label={tr(lang, "Abrir menú", "Open menu")}
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((v) => !v)}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 6h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M4 12h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                <path d="M4 18h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>

            <div className="topbar-brand btn-mobile" aria-hidden>
              <span className="topbar-brand-mark">D+</span>
              <span className="topbar-brand-text">DOMUS+</span>
            </div>
          </div>

          <div className="relative flex items-center gap-2" ref={menuRef}>
            <button className="btn" type="button" disabled aria-label="País">
              MX
            </button>
            <button className="btn" type="button" onClick={toggleLang} aria-label={tr(lang, "Cambiar idioma", "Change language")}>
              {lang === "es" ? "ES" : "EN"}
            </button>
            <button
              className="btn"
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={tr(lang, "Menú de usuario", "User menu")}
            >
              {initials}
            </button>

            {menuOpen ? (
              <div
                className="absolute right-2 top-full z-50 mt-2 w-72 max-w-[calc(100vw-1rem)] rounded-2xl border bg-[rgb(var(--card))] p-2 shadow-sm sm:right-0"
                style={{ borderColor: "rgb(var(--border))" }}
                role="menu"
              >
                <div className="px-3 py-2">
                  <div className="text-sm font-semibold">{displayName}</div>
                  <div className="text-xs muted">{email ?? ""}</div>
                </div>
                <div className="my-1 h-px w-full" style={{ background: "rgb(var(--border))" }} />
                <button
                  className="btn w-full justify-start"
                  type="button"
                  onClick={logout}
                  role="menuitem"
                >
                  <span aria-hidden>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path
                        d="M10 17l5-5-5-5"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M15 12H3"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                      <path
                        d="M21 3v18"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                  {tr(lang, "Cerrar sesión", "Log out")}
                </button>
              </div>
            ) : null}
          </div>
        </header>

        <div className="app-content">{children}</div>
      </div>
      </div>
    </LangProvider>
  );
}
