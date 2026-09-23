import { applyPatch, Operation } from "fast-json-patch";
import { z } from "zod";
import { getAnthropicClient, BACKGROUND_MODEL } from "@/lib/anthropic";
import { memoryWorkerSystemPrompt } from "@/lib/prompts";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

// Background memory worker (SPEC.md §7). Shared by the API route
// (fire-and-forget after each turn) and the 150-turn memory test script
// (awaited directly, so the test runs deterministically).

const SUMMARY_EVERY_N_TURNS = 20;
const MAX_LEVEL_1_SUMMARIES = 5;

const jsonPatchOpSchema = z.object({
  op: z.enum(["add", "remove", "replace", "move", "copy", "test"]),
  path: z.string(),
  value: z.unknown().optional(),
  from: z.string().optional(),
});

const workerOutputSchema = z.object({
  state_patch: z.array(jsonPatchOpSchema),
  new_memories: z.array(
    z.object({
      content: z.string(),
      importance: z.union([
        z.literal(1),
        z.literal(2),
        z.literal(3),
        z.literal(4),
        z.literal(5),
      ]),
    })
  ),
});

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface WorkerResult {
  usage: TokenUsage;
}

// Runs the full worker for one turn: extracts the world-state patch and new
// memories, applies them, and (every SUMMARY_EVERY_N_TURNS turns) generates
// or merges summaries. Must never break the game: callers should catch and
// log, not surface, any error (see SPEC.md §7.1).
export async function runMemoryWorker(
  worldId: string,
  turnIndex: number
): Promise<WorkerResult> {
  const supabase = createServiceSupabaseClient();
  const usage: TokenUsage = { inputTokens: 0, outputTokens: 0 };

  const [{ data: stateRow }, { data: lastMessages }] = await Promise.all([
    supabase
      .from("world_state")
      .select("state, version")
      .eq("world_id", worldId)
      .maybeSingle(),
    supabase
      .from("messages")
      .select("role, content")
      .eq("world_id", worldId)
      .eq("turn_index", turnIndex)
      .order("id", { ascending: true }),
  ]);

  if (!stateRow) throw new Error(`No world_state for world ${worldId}`);

  const lastExchange = (lastMessages ?? [])
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const output = await extractMemoryUpdate(stateRow.state, lastExchange, usage);

  if (output.state_patch.length > 0) {
    const result = applyPatch(
      structuredClone(stateRow.state),
      output.state_patch as Operation[],
      false,
      false
    );
    const newState = result.newDocument;
    const newVersion = stateRow.version + 1;

    await supabase
      .from("world_state")
      .update({
        state: newState,
        version: newVersion,
        updated_at: new Date().toISOString(),
      })
      .eq("world_id", worldId);

    await supabase.from("world_state_history").insert({
      world_id: worldId,
      version: newVersion,
      state: newState,
      diff: output.state_patch,
      source: "ai",
      turn_index: turnIndex,
    });
  }

  if (output.new_memories.length > 0) {
    await supabase.from("memories").insert(
      output.new_memories.map((m) => ({
        world_id: worldId,
        turn_index: turnIndex,
        content: m.content,
        importance: m.importance,
        // embedding: computed in Phase 2 once the embeddings provider is chosen (SPEC.md §13).
      }))
    );
  }

  if (turnIndex % SUMMARY_EVERY_N_TURNS === 0) {
    await maybeSummarize(worldId, turnIndex, usage);
  }

  return { usage };
}

async function extractMemoryUpdate(
  currentState: unknown,
  lastExchange: string,
  usage: TokenUsage
) {
  const anthropic = getAnthropicClient();

  const call = async () => {
    const res = await anthropic.messages.create({
      model: BACKGROUND_MODEL,
      max_tokens: 1024,
      system: memoryWorkerSystemPrompt,
      messages: [
        {
          role: "user",
          content: `FICHE ACTUELLE:\n${JSON.stringify(currentState)}\n\nDERNIER ÉCHANGE:\n${lastExchange}`,
        },
      ],
    });
    usage.inputTokens += res.usage.input_tokens;
    usage.outputTokens += res.usage.output_tokens;
    const text = res.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");
    return workerOutputSchema.parse(JSON.parse(text));
  };

  try {
    return await call();
  } catch {
    // Retry once on invalid JSON / schema mismatch, per SPEC.md §7.1.
    return await call();
  }
}

async function maybeSummarize(worldId: string, toTurn: number, usage: TokenUsage) {
  const supabase = createServiceSupabaseClient();
  const fromTurn = Math.max(1, toTurn - SUMMARY_EVERY_N_TURNS + 1);

  const { data: sliceMessages } = await supabase
    .from("messages")
    .select("role, content, turn_index")
    .eq("world_id", worldId)
    .gte("turn_index", fromTurn)
    .lte("turn_index", toTurn)
    .order("turn_index", { ascending: true });

  const anthropic = getAnthropicClient();
  const transcript = (sliceMessages ?? [])
    .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
    .join("\n\n");

  const res = await anthropic.messages.create({
    model: BACKGROUND_MODEL,
    max_tokens: 500,
    system:
      "Résume cette tranche de jeu de rôle en 200-300 mots, en français, centré sur les événements, décisions, relations et questions ouvertes. Réponds uniquement avec le résumé.",
    messages: [{ role: "user", content: transcript }],
  });
  usage.inputTokens += res.usage.input_tokens;
  usage.outputTokens += res.usage.output_tokens;

  const content = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");

  await supabase.from("summaries").insert({
    world_id: worldId,
    level: 1,
    from_turn: fromTurn,
    to_turn: toTurn,
    content,
  });

  const { data: level1Summaries, count } = await supabase
    .from("summaries")
    .select("id, from_turn, to_turn, content", { count: "exact" })
    .eq("world_id", worldId)
    .eq("level", 1)
    .order("from_turn", { ascending: true });

  if ((count ?? 0) > MAX_LEVEL_1_SUMMARIES && level1Summaries) {
    const oldest = level1Summaries.slice(0, MAX_LEVEL_1_SUMMARIES);
    const mergedTranscript = oldest.map((s) => s.content).join("\n---\n");

    const mergeRes = await anthropic.messages.create({
      model: BACKGROUND_MODEL,
      max_tokens: 600,
      system:
        "Fusionne ces résumés en un méta-résumé de 300-400 mots, en français, en gardant les faits, relations et enjeux les plus importants. Réponds uniquement avec le résumé fusionné.",
      messages: [{ role: "user", content: mergedTranscript }],
    });
    usage.inputTokens += mergeRes.usage.input_tokens;
    usage.outputTokens += mergeRes.usage.output_tokens;

    const mergedContent = mergeRes.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { text: string }).text)
      .join("");

    await supabase.from("summaries").insert({
      world_id: worldId,
      level: 2,
      from_turn: oldest[0].from_turn,
      to_turn: oldest[oldest.length - 1].to_turn,
      content: mergedContent,
    });

    await supabase
      .from("summaries")
      .delete()
      .in(
        "id",
        oldest.map((s) => s.id)
      );
  }
}
