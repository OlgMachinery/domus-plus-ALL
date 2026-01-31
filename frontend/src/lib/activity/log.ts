export type LogActivityInput = {
  family_id: string;
  actor_id: string;
  actor_name?: string | null;
  actor_email?: string | null;
  module: string;
  action: string;
  summary: string;
  entity?: string | null;
  entity_id?: string | null;
  metadata?: Record<string, unknown> | null;
};

export async function logActivity(supabase: unknown, input: LogActivityInput): Promise<void> {
  try {
    const client = supabase as {
      from: (table: string) => {
        insert: (row: Record<string, unknown>) => Promise<{ error?: { message?: string } | null }>;
      };
    };

    await client.from("domus_activity_log").insert({
      family_id: input.family_id,
      actor_id: input.actor_id,
      actor_name: input.actor_name ?? null,
      actor_email: input.actor_email ?? null,
      module: input.module,
      action: input.action,
      entity: input.entity ?? null,
      entity_id: input.entity_id ?? null,
      summary: input.summary,
      metadata: input.metadata ?? {},
    });
  } catch {
    // If the table hasn't been created yet (SQL 09 not executed) or RLS blocks it,
    // we do not want to break the primary flow.
  }
}
