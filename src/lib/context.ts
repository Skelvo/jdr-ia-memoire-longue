import { createServiceSupabaseClient } from "@/lib/supabase";
import { WorldState, StoredMessage } from "@/lib/types";

const RECENT_MESSAGES_WINDOW = 16;

export interface TurnContext {
  worldState: WorldState;
  summaries: string[]; // most recent level-2 then level-1 summaries, oldest first
  recentMessages: StoredMessage[];
}

// Phase 1: world sheet + hierarchical summaries + recent window.
// Phase 2 adds the semantic "memories" layer (embeddings + pgvector).
export async function buildTurnContext(worldId: string): Promise<TurnContext> {
  const supabase = createServiceSupabaseClient();

  const [{ data: stateRow }, { data: summaryRows }, { data: messageRows }] =
    await Promise.all([
      supabase
        .from("world_state")
        .select("state")
        .eq("world_id", worldId)
        .maybeSingle(),
      supabase
        .from("summaries")
        .select("level, content, to_turn")
        .eq("world_id", worldId)
        .order("level", { ascending: false })
        .order("to_turn", { ascending: false })
        .limit(6),
      supabase
        .from("messages")
        .select("id, world_id, turn_index, role, content, created_at")
        .eq("world_id", worldId)
        .order("turn_index", { ascending: false })
        .limit(RECENT_MESSAGES_WINDOW),
    ]);

  const worldState = (stateRow?.state as WorldState) ?? undefined;
  const summaries = (summaryRows ?? [])
    .map((row) => row.content as string)
    .reverse();
  const recentMessages = ((messageRows ?? []) as StoredMessage[])
    .slice()
    .reverse();

  if (!worldState) {
    throw new Error(`No world_state found for world ${worldId}`);
  }

  return { worldState, summaries, recentMessages };
}
