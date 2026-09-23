import { notFound, redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { WorldState } from "@/lib/types";
import { CarnetClient } from "./carnet-client";

// Écran Carnet (SPEC.md §9, écran 5) : le point fort de l'app — la mémoire
// visible et modifiable. Onglets Personnages / Lieux / Quêtes / Faits / Résumé.
export default async function CarnetPage({
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

  const [{ data: world }, { data: stateRow }, { data: summaries }] =
    await Promise.all([
      supabase.from("worlds").select("id, title").eq("id", worldId).maybeSingle(),
      supabase
        .from("world_state")
        .select("state")
        .eq("world_id", worldId)
        .maybeSingle(),
      supabase
        .from("summaries")
        .select("id, level, from_turn, to_turn, content")
        .eq("world_id", worldId)
        .order("level", { ascending: false })
        .order("to_turn", { ascending: false }),
    ]);

  if (!world || !stateRow) {
    notFound();
  }

  return (
    <CarnetClient
      worldId={world.id}
      title={world.title}
      initialState={stateRow.state as WorldState}
      summaries={summaries ?? []}
    />
  );
}
