import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { cookies } from "next/headers";
import { AppShell } from "@/components/AppShell";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "DOMUS+",
  description: "Finanzas familiares con reglas claras",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const store = await cookies();
  const lang = (store.get("domus_lang")?.value === "en" ? "en" : "es") as "es" | "en";
  return (
    <html lang={lang} suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`} suppressHydrationWarning>
        <Script id="domus-strip-ext-attrs" strategy="beforeInteractive">
          {`(() => {
  try {
    const root = document.documentElement;
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
    while (walker.nextNode()) {
      const el = walker.currentNode;
      if (!(el instanceof Element)) continue;
      const names = el.getAttributeNames();
      for (const name of names) {
        if (name.startsWith('data-np-')) el.removeAttribute(name);
      }
    }
  } catch {
    // ignore
  }
})();`}
        </Script>

        <AppShell initialLang={lang}>{children}</AppShell>
      </body>
    </html>
  );
}
