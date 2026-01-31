import LoginForm from "./LoginForm";
import { getLangFromCookies } from "@/lib/i18n/server";

export default async function LoginPage() {
  const lang = await getLangFromCookies();
  return <LoginForm initialLang={lang} />;
}
