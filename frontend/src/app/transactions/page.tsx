import TransactionsClient from "./TransactionsClient";
import { requireFamily } from "@/lib/auth/requireFamily";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CategoryRow = {
  id: string;
  name: string;
  family_id: string | null;
  parent_id: string | null;
  sort_order: number | null;
};

type TransactionRow = {
  id: string;
  year: number;
  kind: "income" | "expense";
  amount: number;
  currency: string;
  category_id: string;
  concept: string;
  merchant: string | null;
  occurred_at: string;
  category_name: string;
  subcategory_name: string;
};

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const profile = await requireFamily();
  const supabase = await createClient();
  const familyId = profile.family_id!;

  const currentYear = new Date().getFullYear();
  const sp = (await searchParams) ?? {};
  const yearParam = Array.isArray(sp.year) ? sp.year[0] : sp.year;
  const year = yearParam ? Number(yearParam) : currentYear;
  const safeYear = Number.isFinite(year) ? year : currentYear;

  const { data: categories, error: categoriesError } = await supabase
    .from("domus_budget_categories")
    .select("id,name,family_id,parent_id,sort_order")
    .or(`family_id.is.null,family_id.eq.${familyId}`);

  if (categoriesError) {
    throw new Error(categoriesError.message);
  }

  const { data: transactionsRaw, error: txError } = await supabase
    .from("domus_transactions")
    .select(
      "id,year,kind,amount,currency,category_id,concept,merchant,occurred_at"
    )
    .eq("year", safeYear)
    .eq("family_id", familyId)
    .order("occurred_at", { ascending: false });

  if (txError) {
    // This will fail until you execute SQL 08 in Supabase.
    throw new Error(txError.message);
  }

  const categoryById = new Map(((categories ?? []) as CategoryRow[]).map((c) => [c.id, c] as const));
  const transactions = ((transactionsRaw ?? []) as Array<{
    id: string;
    year: number;
    kind: "income" | "expense";
    amount: number;
    currency: string;
    category_id: string;
    concept: string;
    merchant: string | null;
    occurred_at: string;
  }>).map((t) => {
    const sub = categoryById.get(t.category_id);
    const parent = sub?.parent_id ? categoryById.get(sub.parent_id) : null;
    const categoryName = parent?.name ?? sub?.name ?? "(Categoría)";
    const subcategoryName = sub?.parent_id ? sub.name : "(Subcategoría)";
    return {
      ...t,
      category_name: categoryName,
      subcategory_name: subcategoryName,
    } satisfies TransactionRow;
  });

  return (
    <main className="mx-auto w-full max-w-6xl">
      <TransactionsClient
        familyId={familyId}
        currentYear={currentYear}
        initialYear={safeYear}
        categories={(categories ?? []) as CategoryRow[]}
        transactions={transactions}
      />
    </main>
  );
}
