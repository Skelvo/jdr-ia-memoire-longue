import { NextRequest } from "next/server";
import { getAnthropicClient, NARRATION_MODEL } from "@/lib/anthropic";
import { buildTurnContext } from "@/lib/context";
import { gameMasterSystemPrompt } from "@/lib/prompts";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface TurnRequestBody {
  worldId: string;
  message: string;
  tone: string;
  genre: string;
}

// POST /api/turn — pipeline of one game turn, per SPEC.md §5.
// Phase 1: no auth/quota checks yet (single-history prototype) — see SPEC.md §8/§12.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as TurnRequestBody;
  const { worldId, message, tone, genre } = body;

  if (!worldId || !message) {
    return new Response(
      JSON.stringify({ error: "worldId et message sont requis." }),
      { status: 400, headers: { "content-type": "application/json" } }
    );
  }

  // Auth check via the user-scoped client: RLS guarantees this world query
  // only returns a row the requester actually owns (SPEC.md §4/§10).
  const authClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return new Response(JSON.stringify({ error: "Non authentifié." }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const { data: world } = await authClient
    .from("worlds")
    .select("turn_count")
    .eq("id", worldId)
    .maybeSingle();

  if (!world) {
    return new Response(JSON.stringify({ error: "Monde introuvable." }), {
      status: 404,
      headers: { "content-type": "application/json" },
    });
  }

  // From here on, use the service client: the memory worker call it triggers
  // needs elevated access anyway, and ownership was already established above.
  const supabase = createServiceSupabaseClient();

  const nextTurn = world.turn_count + 1;

  // Build the context BEFORE inserting the player's new message: buildTurnContext
  // reads the recent messages window from the DB, so inserting first would make
  // this turn's message appear twice (once from that window, once appended below).
  const context = await buildTurnContext(worldId);

  await supabase.from("messages").insert({
    world_id: worldId,
    turn_index: nextTurn,
    role: "user",
    content: message,
  });

  const anthropic = getAnthropicClient();

  const stream = anthropic.messages.stream({
    model: NARRATION_MODEL,
    max_tokens: 900,
    system: [
      {
        type: "text",
        text: gameMasterSystemPrompt(tone, genre),
        // Prompt caching: identical on every turn, per SPEC.md §5/§8.
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: [
          "FICHE DU MONDE:",
          JSON.stringify(context.worldState),
          "",
          "RÉSUMÉS (du plus ancien au plus récent):",
          context.summaries.join("\n---\n") || "(aucun résumé pour l'instant)",
        ].join("\n"),
      },
    ],
    messages: [
      ...context.recentMessages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
      { role: "user" as const, content: message },
    ],
  });

  const encoder = new TextEncoder();
  let fullText = "";

  const body_stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      stream.on("text", (delta) => {
        fullText += delta;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`)
        );
      });

      stream.on("error", (err) => {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ error: "Le MJ a rencontré un problème, réessaie." })}\n\n`
          )
        );
        console.error("Anthropic stream error:", err);
        controller.close();
      });

      await stream.finalMessage();

      await supabase.from("messages").insert({
        world_id: worldId,
        turn_index: nextTurn,
        role: "assistant",
        content: fullText,
      });

      await supabase
        .from("worlds")
        .update({ turn_count: nextTurn, updated_at: new Date().toISOString() })
        .eq("id", worldId);

      // Fire-and-forget: the memory worker runs in the background (SPEC.md §7)
      // and must never block the player's response.
      fetch(new URL("/api/worker/update-memory", req.url), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ worldId, turnIndex: nextTurn }),
      }).catch((err) => console.error("update-memory trigger failed:", err));

      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });

  return new Response(body_stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    },
  });
}
