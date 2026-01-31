import { requireFamily } from "@/lib/auth/requireFamily";
import { createClient } from "@/lib/supabase/server";
import ActivityClient from "./ActivityClientImpl";

export const dynamic = "force-dynamic";

export default async function ActivityPage() {
  const profile = await requireFamily();
  const supabase = await createClient();

  const res = await supabase
    .from("domus_activity_log")
    .select("id,created_at,module,action,entity,entity_id,summary,metadata,actor_id,actor_name,actor_email")
    .eq("family_id", profile.family_id)
    .order("created_at", { ascending: false })
    .limit(50);

  const items = (res.data ?? []) as Array<{
    id: string;
    created_at: string;
    module: string;
    action: string;
    entity: string | null;
    entity_id: string | null;
    summary: string;
    metadata: Record<string, unknown> | null;
    actor_id: string | null;
    actor_name: string | null;
    actor_email: string | null;
  }>;

  const needsSql = Boolean(
    res.error && /domus_activity_log|does not exist/i.test(res.error.message || "")
  );

  return (
    <main className="mx-auto w-full max-w-6xl">
      <ActivityClient familyId={profile.family_id!} initialItems={items} needsSql={needsSql} />
    </main>
  );
}
