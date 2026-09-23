import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

interface UndoRequestBody {
  worldId: string;
}

// POST /api/turn/undo — "Annuler le dernier tour" (SPEC.md §9 UX). Removes the
// last exchange and rolls the world sheet back to how it was before that turn,
// using world_state_history (every turn's AI patch is recorded there with its
// turn_index — see the memory worker).
//
// Known limitation (Phase 1): if called before the background memory worker
// has finished for that turn ("Carnet mis à jour" not yet shown), the rollback
// may be incomplete. Also doesn't unmerge a level-2 summary if this turn
// happened to trigger one (rare: every >5 level-1 summaries).
export async function POST(req: NextRequest) {
  const { worldId } = (await req.json()) as UndoRequestBody;

  const authClient = await createServerSupabaseClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { data: world } = await authClient
    .from("worlds")
    .select("turn_count")
    .eq("id", worldId)
    .maybeSingle();

  if (!world) {
    return NextResponse.json({ error: "Monde introuvable." }, { status: 404 });
  }

  if (world.turn_count === 0) {
    return NextResponse.json(
      { error: "Rien à annuler." },
      { status: 400 }
    );
  }

  const lastTurn = world.turn_count;
  const supabase = createServiceSupabaseClient();

  const { data: currentState } = await supabase
    .from("world_state")
    .select("version")
    .eq("world_id", worldId)
    .maybeSingle();

  // Roll the sheet back to the version right before this turn's AI patch,
  // if the worker had already applied one.
  const { data: thisTurnHistory } = await supabase
    .from("world_state_history")
    .select("version")
    .eq("world_id", worldId)
    .eq("turn_index", lastTurn)
    .eq("source", "ai")
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (thisTurnHistory && currentState) {
    const previousVersion = thisTurnHistory.version - 1;
    const { data: previousHistory } = await supabase
      .from("world_state_history")
      .select("state")
      .eq("world_id", worldId)
      .eq("version", previousVersion)
      .maybeSingle();

    if (previousHistory) {
      await supabase
        .from("world_state")
        .update({
          state: previousHistory.state,
          version: previousVersion,
          updated_at: new Date().toISOString(),
        })
        .eq("world_id", worldId);
    }

    await supabase
      .from("world_state_history")
      .delete()
      .eq("world_id", worldId)
      .eq("version", thisTurnHistory.version);
  }

  await Promise.all([
    supabase.from("messages").delete().eq("world_id", worldId).eq("turn_index", lastTurn),
    supabase.from("memories").delete().eq("world_id", worldId).eq("turn_index", lastTurn),
    supabase
      .from("summaries")
      .delete()
      .eq("world_id", worldId)
      .eq("level", 1)
      .eq("to_turn", lastTurn),
    supabase
      .from("worlds")
      .update({ turn_count: lastTurn - 1, updated_at: new Date().toISOString() })
      .eq("id", worldId),
  ]);

  return NextResponse.json({ ok: true });
}
