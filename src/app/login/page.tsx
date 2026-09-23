"use client";

import { useState } from "react";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
    "idle"
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const supabase = createBrowserSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setStatus(error ? "error" : "sent");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <div className="w-full max-w-sm space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Se connecter</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Un lien de connexion te sera envoyé par e-mail, pas de mot de
            passe.
          </p>
        </div>

        {status === "sent" ? (
          <p className="rounded-lg border border-zinc-800 bg-zinc-900 p-4 text-sm">
            Lien envoyé à <span className="font-medium">{email}</span>.
            Ouvre-le depuis ton téléphone ou cet appareil pour continuer.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="email"
              required
              placeholder="ton@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm outline-none focus:border-zinc-600"
            />
            <button
              type="submit"
              disabled={status === "sending"}
              className="w-full rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-950 disabled:opacity-50"
            >
              {status === "sending" ? "Envoi..." : "Recevoir le lien"}
            </button>
            {status === "error" && (
              <p className="text-sm text-red-400">
                Un problème est survenu, réessaie.
              </p>
            )}
          </form>
        )}
      </div>
    </main>
  );
}
