"use client";

import React, { createContext, useContext } from "react";

export type Lang = "es" | "en";

export function normalizeLang(value: unknown): Lang {
  return value === "en" ? "en" : "es";
}

const LangContext = createContext<Lang>("es");

export function LangProvider({
  lang,
  children,
}: {
  lang: Lang;
  children: React.ReactNode;
}) {
  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>;
}

export function useLang(): Lang {
  return useContext(LangContext);
}

export function tr(lang: Lang, es: string, en: string): string {
  return lang === "en" ? en : es;
}

export function useTr(): (es: string, en: string) => string {
  const lang = useLang();
  return (es: string, en: string) => tr(lang, es, en);
}
