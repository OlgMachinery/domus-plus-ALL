import RegisterForm from "./RegisterForm";
import { getLangFromCookies } from "@/lib/i18n/server";

export default async function RegisterPage() {
  const lang = await getLangFromCookies();
  return <RegisterForm initialLang={lang} />;
}
