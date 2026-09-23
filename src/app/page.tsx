import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Phase 1: a single story per player (SPEC.md §12). This page just routes the
// player to the right place: login, story creation, or the game screen.
export default async function HomePage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: world } = await supabase
    .from("worlds")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  redirect(world ? `/play/${world.id}` : "/new");
}
