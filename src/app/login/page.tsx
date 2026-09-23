"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

// TEMPORAIRE (Phase 1, pour tester sans attendre les emails) : email + mot de
// passe. La spec (§9, écran 1) prévoit magic link ou Google — à remplacer
// avant la vraie mise en ligne. Nécessite "Confirm email" désactivé dans
// Supabase (Authentication > Sign In / Providers > Email), sinon l'inscription
// redemande une confirmation par email et on retombe sur le problème de lenteur.
export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    router.push("/");
  }

  async function handleSignUp() {
    setStatus("loading");
    const supabase = createBrowserSupabaseClient();
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setStatus("error");
      setErrorMessage(error.message);
      return;
    }
    if (!data.session) {
      // Compte créé mais pas de session : Supabase attend une confirmation
      // par email ("Confirm email" encore activé côté Authentication > Providers).
      setStatus("error");
      setErrorMessage(
        "Compte créé, mais pas connecté automatiquement : \"Confirm email\" est probablement encore activé dans Supabase (Authentication > Sign In / Providers > Email). Désactive-le puis réessaie."
      );
      return;
    }
    router.push("/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Se connecter</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Version de test (email + mot de passe). Pas encore de compte ?
            Utilise &quot;Créer un compte&quot; ci-dessous.
          </p>
        </div>

        <form onSubmit={handleSignIn} className="space-y-3">
          <input
            type="email"
            required
            placeholder="ton@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm outline-none focus:border-zinc-600"
          />
          <input
            type="password"
            required
            placeholder="Mot de passe"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm outline-none focus:border-zinc-600"
          />

          <button
            type="submit"
            disabled={status === "loading"}
            className="w-full rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-950 disabled:opacity-50"
          >
            {status === "loading" ? "..." : "Se connecter"}
          </button>
          <button
            type="button"
            onClick={handleSignUp}
            disabled={status === "loading"}
            className="w-full rounded-lg border border-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-100 disabled:opacity-50"
          >
            Créer un compte
          </button>

          {status === "error" && (
            <p className="text-sm text-red-400">{errorMessage}</p>
          )}
        </form>
      </div>
    </main>
  );
}
