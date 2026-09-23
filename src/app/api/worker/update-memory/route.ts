import { NextRequest } from "next/server";
import { runMemoryWorker } from "@/lib/worker";

export const runtime = "nodejs";

interface RequestBody {
  worldId: string;
  turnIndex: number;
}

// POST /api/worker/update-memory — background job run after each turn (SPEC.md §7).
// Must never break the game: failures here are logged, not surfaced to the player.
export async function POST(req: NextRequest) {
  const { worldId, turnIndex } = (await req.json()) as RequestBody;

  try {
    await runMemoryWorker(worldId, turnIndex);
  } catch (err) {
    // Robustness rule from SPEC.md §7.1: log and continue, never break the game.
    console.error(`update-memory failed for world ${worldId}, turn ${turnIndex}:`, err);
  }

  return new Response(null, { status: 204 });
}
