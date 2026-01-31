import { requireFamily } from "@/lib/auth/requireFamily";
import { createClient } from "@/lib/supabase/server";
import ReceiptsClient from "./ReceiptsClientNoSSR";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage() {
  const profile = await requireFamily();
  const supabase = await createClient();

  const categoriesRes = await supabase
    .from("domus_budget_categories")
    .select("id,name,family_id,parent_id,sort_order")
    .or(`family_id.is.null,family_id.eq.${profile.family_id}`)
    .order("sort_order", { ascending: true, nullsFirst: false })
    .order("name", { ascending: true });

  const { data } = await supabase
    .from("domus_receipts")
    .select(
      "id,created_at,receipt_date,amount,merchant,note,file_path,file_name,mime_type,size_bytes,ai_status,ai_updated_at,extracted_total,extracted_currency,extracted_date,extracted_merchant,ai_extracted"
    )
    .eq("family_id", profile.family_id)
    .order("created_at", { ascending: false })
    .limit(50);

  const receipts = (data ?? []) as Array<{
    id: string;
    created_at: string;
    receipt_date: string;
    amount: number | null;
    merchant: string | null;
    note: string | null;
    file_path: string;
    file_name: string;
    mime_type: string | null;
    size_bytes: number | null;
    ai_status?: "pending" | "done" | "error";
    ai_updated_at?: string | null;
    extracted_total?: number | null;
    extracted_currency?: string | null;
    extracted_date?: string | null;
    extracted_merchant?: string | null;
    ai_extracted?: unknown;
  }>;

  const categories = (categoriesRes.data ?? []) as Array<{
    id: string;
    name: string;
    family_id: string | null;
    parent_id: string | null;
    sort_order: number | null;
  }>;

  return (
    <main className="mx-auto w-full max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Recibos</h1>
        <p className="mt-2 text-sm muted">
          Sube comprobantes y consúltalos desde aquí.
        </p>
      </div>

      <ReceiptsClient
        familyId={profile.family_id!}
        userId={profile.id}
        initialReceipts={receipts}
        categories={categories}
      />
    </main>
  );
}
