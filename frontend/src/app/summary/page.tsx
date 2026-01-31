import { requireFamily } from "@/lib/auth/requireFamily";
import { createClient } from "@/lib/supabase/server";
import SummaryClient, { type SummaryBudgetRow } from "./SummaryClient";

export const dynamic = "force-dynamic";

type CategoryRow = {
  id: string;
  name: string;
  family_id: string | null;
  parent_id: string | null;
  sort_order: number | null;
};

export default async function SummaryPage(props: { searchParams?: Promise<{ year?: string }> }) {
  const profile = await requireFamily();
  const supabase = await createClient();

  const currentYear = new Date().getFullYear();
  const searchParams = (await props.searchParams) ?? {};
  const selectedYearRaw = Number(searchParams.year);
  const year = Number.isFinite(selectedYearRaw) ? selectedYearRaw : currentYear;

  const categoriesRes = await supabase
    .from("domus_budget_categories")
    .select("id,name,family_id,parent_id,sort_order")
    .or(`family_id.is.null,family_id.eq.${profile.family_id}`)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  if (categoriesRes.error) {
    throw new Error(categoriesRes.error.message);
  }

  const budgetsRes = await supabase
    .from("domus_annual_budgets")
    .select("id,year,amount,currency,category_id")
    .eq("family_id", profile.family_id)
    .eq("year", year)
    .order("created_at", { ascending: false });

  if (budgetsRes.error) {
    throw new Error(budgetsRes.error.message);
  }

  // Aggregate spent from transactions (expenses) per subcategory.
  // If domus_transactions doesn't exist yet in a given environment, default spent to 0.
  const spentByCategoryId = new Map<string, number>();
  const txRes = await supabase
    .from("domus_transactions")
    .select("category_id,amount")
    .eq("family_id", profile.family_id)
    .eq("year", year)
    .eq("kind", "expense");

  if (!txRes.error) {
    for (const row of (txRes.data ?? []) as Array<{ category_id: string; amount: number }>) {
      const prev = spentByCategoryId.get(row.category_id) ?? 0;
      spentByCategoryId.set(row.category_id, prev + Number(row.amount || 0));
    }
  }

  const categories = (categoriesRes.data ?? []) as CategoryRow[];
  const categoryById = new Map(categories.map((c) => [c.id, c] as const));

  const budgets = ((budgetsRes.data ?? []) as Array<{
    id: string;
    year: number;
    amount: number;
    currency: string;
    category_id: string;
  }>).map((b) => {
    const sub = categoryById.get(b.category_id);
    const parent = sub?.parent_id ? categoryById.get(sub.parent_id) : null;
    const categoryName = parent?.name ?? sub?.name ?? "(Categoría)";
    const subcategoryName = sub?.parent_id ? sub.name : "(Subcategoría)";
    const spent = spentByCategoryId.get(b.category_id) ?? 0;
    return {
      ...b,
      amount: Number(b.amount || 0),
      spent,
      category_name: categoryName,
      subcategory_name: subcategoryName,
    } satisfies SummaryBudgetRow;
  });

  return (
    <main className="mx-auto w-full max-w-6xl">
      <SummaryClient currentYear={currentYear} initialYear={year} budgets={budgets} />
    </main>
  );
}
