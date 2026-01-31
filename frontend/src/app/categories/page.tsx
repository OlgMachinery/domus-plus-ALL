import { requireFamily } from "@/lib/auth/requireFamily";
import { createClient } from "@/lib/supabase/server";
import CategoriesClient from "./CategoriesClient";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const profile = await requireFamily();
  const supabase = await createClient();

  const categoriesRes = await supabase
    .from("domus_budget_categories")
    .select("id,name,family_id,parent_id,sort_order")
    .or(`family_id.is.null,family_id.eq.${profile.family_id}`)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  const categories = (categoriesRes.data ?? []) as Array<{
    id: string;
    name: string;
    family_id: string | null;
    parent_id: string | null;
    sort_order: number | null;
  }>;

  return (
    <main className="mx-auto w-full max-w-6xl">
      <CategoriesClient familyId={profile.family_id!} categories={categories} />
    </main>
  );
}
