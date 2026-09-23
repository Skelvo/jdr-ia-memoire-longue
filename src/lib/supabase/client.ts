import { createBrowserClient } from "@supabase/ssr";

// Client for use in the browser: respects RLS via the anon/publishable key.
export function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
