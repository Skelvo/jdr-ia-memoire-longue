import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { WorldState } from "@/lib/types";

// PATCH /api/worlds/[worldId]/state — the Carnet screen's edits (SPEC.md §9,
// écran 5). A player correction is saved with source = 'player' and always
// wins over the AI: it simply replaces the current sheet.
// RLS on world_state (join on worlds.user_id) enforces ownership.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ worldId: string }> }
) {
  const { worldId } = await params;
  const newState = (await req.json()) as WorldState;

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { data: current } = await supabase
    .from("world_state")
    .select("version")
    .eq("world_id", worldId)
    .maybeSingle();

  if (!current) {
    return NextResponse.json({ error: "Monde introuvable." }, { status: 404 });
  }

  const newVersion = current.version + 1;

  const { error } = await supabase
    .from("world_state")
    .update({
      state: newState,
      version: newVersion,
      updated_at: new Date().toISOString(),
    })
    .eq("world_id", worldId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await supabase.from("world_state_history").insert({
    world_id: worldId,
    version: newVersion,
    state: newState,
    diff: null,
    source: "player",
    turn_index: null,
  });

  return NextResponse.json({ ok: true });
}
