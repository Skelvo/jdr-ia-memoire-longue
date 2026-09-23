import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { emptyWorldState } from "@/lib/types";

interface CreateWorldBody {
  title: string;
  premise: string;
  genre: string;
  tone: string;
  playerName: string;
  playerDescription: string;
}

// POST /api/worlds — creates a new story (SPEC.md §9, écran 3). Uses the
// user-scoped client so RLS enforces worlds.user_id = auth.uid() on insert.
export async function POST(req: NextRequest) {
  const body = (await req.json()) as CreateWorldBody;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { data: world, error } = await supabase
    .from("worlds")
    .insert({
      user_id: user.id,
      title: body.title,
      premise: body.premise,
      genre: body.genre,
      tone: body.tone,
      player_character: {
        name: body.playerName,
        description: body.playerDescription,
      },
    })
    .select("id")
    .single();

  if (error || !world) {
    return NextResponse.json(
      { error: error?.message ?? "Création impossible." },
      { status: 500 }
    );
  }

  const worldState = structuredClone(emptyWorldState);
  worldState.player.name = body.playerName;

  await supabase.from("world_state").insert({
    world_id: world.id,
    state: worldState,
    version: 1,
  });

  // Record the initial state in history too, so "undo the last turn" and
  // Carnet edits always have a version-1 baseline to roll back to.
  await supabase.from("world_state_history").insert({
    world_id: world.id,
    version: 1,
    state: worldState,
    diff: null,
    source: "player",
    turn_index: null,
  });

  return NextResponse.json({ worldId: world.id });
}
