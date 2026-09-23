import { createClient } from "@supabase/supabase-js";

// Server-only client using the service role key: bypasses RLS, never expose to the
// client. Used by the turn pipeline and the memory worker, which act on behalf of
// an already-authenticated request (see ownership checks in the route handlers).
export function createServiceSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars."
    );
  }
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
