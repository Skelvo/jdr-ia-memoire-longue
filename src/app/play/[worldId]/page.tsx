import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { StoredMessage } from "@/lib/types";
import { GameScreen } from "./game-screen";

// Écran de jeu (SPEC.md §9, écran 4). Server component: loads the world and
// its message history (RLS ensures the player only ever sees their own world),
// then hands off to the client component for the interactive chat + streaming.
export default async function PlayPage({
  params,
}: {
  params: Promise<{ worldId: string }>;
}) {
  const { worldId } = await params;
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: world } = await supabase
    .from("worlds")
    .select("id, title, genre, tone, turn_count")
    .eq("id", worldId)
    .maybeSingle();

  if (!world) {
    notFound();
  }

  const { data: messages } = await supabase
    .from("messages")
    .select("id, world_id, turn_index, role, content, created_at")
    .eq("world_id", worldId)
    .order("turn_index", { ascending: true });

  return (
    <GameScreen
      worldId={world.id}
      title={world.title}
      genre={world.genre ?? ""}
      tone={world.tone ?? ""}
      initialMessages={(messages ?? []) as StoredMessage[]}
    />
  );
}
