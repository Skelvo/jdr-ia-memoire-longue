import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Handles the magic-link redirect: exchanges the code for a session, then
// sends the player to the home page, which routes them to their story.
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (code) {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  return NextResponse.redirect(new URL("/", request.url));
}
