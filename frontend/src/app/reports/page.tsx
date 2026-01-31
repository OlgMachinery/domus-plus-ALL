import { requireFamily } from "@/lib/auth/requireFamily";
import ReportsClient from "./ReportsClient";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  await requireFamily();
  return (
    <main className="mx-auto w-full max-w-6xl">
      <ReportsClient />
    </main>
  );
}
