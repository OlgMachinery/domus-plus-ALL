import { requireFamily } from "@/lib/auth/requireFamily";
import { createClient } from "@/lib/supabase/server";
import BudgetsClient from "./BudgetsClient";

export const dynamic = "force-dynamic";

export default async function BudgetsPage(props: { searchParams?: Promise<{ year?: string }> }) {
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

  const budgetsRes = await supabase
    .from("domus_annual_budgets")
    .select("id,year,amount,currency,category_id")
    .eq("family_id", profile.family_id)
    .eq("year", year)
    .order("created_at", { ascending: false });

  const categories = (categoriesRes.data ?? []) as Array<{
    id: string;
    name: string;
    family_id: string | null;
    parent_id: string | null;
    sort_order: number | null;
  }>;

  const budgetsRaw = (budgetsRes.data ?? []) as Array<{
    id: string;
    year: number;
    amount: number;
    currency: string;
    category_id: string;
  }>;

  const categoryById = new Map(categories.map((c) => [c.id, c] as const));
  const budgets = budgetsRaw.map((b) => {
    const sub = categoryById.get(b.category_id);
    const parent = sub?.parent_id ? categoryById.get(sub.parent_id) : null;
    const categoryName = parent?.name ?? sub?.name ?? "(Categoría)";
    const subcategoryName = sub?.parent_id ? sub.name : "(Subcategoría)";
    const isCommon = (parent?.family_id ?? sub?.family_id) === null;
    return {
      ...b,
      category_name: categoryName,
      subcategory_name: subcategoryName,
      is_common: isCommon,
    };
  });

  return (
    <main className="mx-auto w-full max-w-6xl">
      <BudgetsClient
        familyId={profile.family_id!}
        currentYear={currentYear}
        initialYear={year}
        categories={categories}
        budgets={budgets}
      />
    </main>
  );
}
