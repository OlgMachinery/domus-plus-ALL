import { cookies } from "next/headers";

export type Lang = "es" | "en";

export async function getLangFromCookies(): Promise<Lang> {
  try {
    const store = await cookies();
    const value = store.get("domus_lang")?.value;
    return value === "en" ? "en" : "es";
  } catch {
    return "es";
  }
}
