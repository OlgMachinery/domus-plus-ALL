import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { jsonError } from "@/lib/http/respond";

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient(request);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return jsonError("Not authenticated", 401);
    }

    const bootstrap = await supabase.rpc("domus_bootstrap_accounts");
    if (bootstrap.error) {
      return jsonError(bootstrap.error.message, 400);
    }

    const isAdmin = !!bootstrap.data?.is_admin;
    const personalAccountId = bootstrap.data?.personal_account_id as string | undefined;
    const familyAccountId = (bootstrap.data?.family_account_id as string | null | undefined) || null;

    const url = new URL(request.url);
    const requestedAccountId = url.searchParams.get("account_id") || undefined;
    const limitRaw = url.searchParams.get("limit");
    const limit = Math.max(1, Math.min(200, Number(limitRaw || "50") || 50));

    const accountId = isAdmin
      ? requestedAccountId || familyAccountId || personalAccountId
      : personalAccountId;

    if (!accountId) {
      return jsonError("No account available", 400);
    }

    const ledgerQuery = await supabase
      .from("domus_ledger")
      .select(
        "id,created_at,movement_type,amount,balance_after,concept,status,reference_type,reference_id,evidence_url"
      )
      .eq("account_id", accountId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (ledgerQuery.error) {
      return jsonError(ledgerQuery.error.message, 400);
    }

    // Prefer service role for the balances view (avoids potential RLS recursion edge-cases).
    // If the service role key is missing or invalid, fall back to the user-scoped SSR client.
    const balanceQuery = await (async () => {
      try {
        const admin = createAdminClient();
        const res = await admin
          .from("domus_balances")
          .select("current_balance")
          .eq("account_id", accountId)
          .maybeSingle();

        if (res.error && /invalid api key/i.test(res.error.message)) {
          return await supabase
            .from("domus_balances")
            .select("current_balance")
            .eq("account_id", accountId)
            .maybeSingle();
        }

        return res;
      } catch {
        return await supabase
          .from("domus_balances")
          .select("current_balance")
          .eq("account_id", accountId)
          .maybeSingle();
      }
    })();

    if (balanceQuery.error) {
      return jsonError(balanceQuery.error.message, 400);
    }

    return NextResponse.json({
      account_id: accountId,
      balance: balanceQuery.data?.current_balance ?? 0,
      items: ledgerQuery.data ?? [],
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : "Unknown error", 500);
  }
}
