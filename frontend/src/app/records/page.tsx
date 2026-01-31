import { requireFamily } from "@/lib/auth/requireFamily";
import { createClient } from "@/lib/supabase/server";
import RecordsClient from "./RecordsClientNoSSR";

export const dynamic = "force-dynamic";

export default async function RecordsPage() {
  const profile = await requireFamily();
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("domus_receipts")
    .select(
      "id,created_at,receipt_date,amount,merchant,note,file_path,file_name,mime_type,size_bytes,ai_status,ai_updated_at,extracted_total,extracted_currency,extracted_date,extracted_merchant"
    )
    .eq("family_id", profile.family_id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    throw new Error(error.message);
  }

  const receipts = (data ?? []) as Parameters<typeof RecordsClient>[0]["initialReceipts"];

  return (
    <main className="mx-auto w-full max-w-6xl">
      <RecordsClient initialReceipts={receipts} />
    </main>
  );
}
