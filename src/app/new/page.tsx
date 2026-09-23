"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const GENRES = ["Fantasy", "Science-fiction", "Polar", "Horreur légère"];
const TONES = ["Épique", "Sombre", "Léger", "Humoristique"];

export default function NewStoryPage() {
  const router = useRouter();
  const [genre, setGenre] = useState(GENRES[0]);
  const [tone, setTone] = useState(TONES[0]);
  const [premise, setPremise] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [playerDescription, setPlayerDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/worlds", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        title: `${playerName} — ${genre}`,
        premise,
        genre,
        tone,
        playerName,
        playerDescription,
      }),
    });

    if (!res.ok) {
      setSubmitting(false);
      setError("Impossible de créer l'histoire, réessaie.");
      return;
    }

    const { worldId } = await res.json();
    router.push(`/play/${worldId}`);
  }

  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-12 text-zinc-100">
      <form
        onSubmit={handleSubmit}
        className="mx-auto max-w-lg space-y-6"
      >
        <div>
          <h1 className="text-2xl font-semibold">Nouvelle histoire</h1>
          <p className="mt-2 text-sm text-zinc-400">
            Choisis un genre, un ton, et décris ton personnage. Le MJ s&apos;en
            souviendra pour toujours.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Genre</label>
          <div className="flex flex-wrap gap-2">
            {GENRES.map((g) => (
              <button
                type="button"
                key={g}
                onClick={() => setGenre(g)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  genre === g
                    ? "border-zinc-100 bg-zinc-100 text-zinc-950"
                    : "border-zinc-800 text-zinc-300"
                }`}
              >
                {g}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">Ton</label>
          <div className="flex flex-wrap gap-2">
            {TONES.map((t) => (
              <button
                type="button"
                key={t}
                onClick={() => setTone(t)}
                className={`rounded-full border px-3 py-1.5 text-sm ${
                  tone === t
                    ? "border-zinc-100 bg-zinc-100 text-zinc-950"
                    : "border-zinc-800 text-zinc-300"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Pitch de départ
          </label>
          <textarea
            required
            rows={3}
            value={premise}
            onChange={(e) => setPremise(e.target.value)}
            placeholder="Ex : Un royaume au bord de la guerre civile, et toi, simple messager, porteur d'un secret qui pourrait tout changer."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm outline-none focus:border-zinc-600"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Nom du personnage
          </label>
          <input
            required
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm outline-none focus:border-zinc-600"
          />
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            Description courte
          </label>
          <input
            value={playerDescription}
            onChange={(e) => setPlayerDescription(e.target.value)}
            placeholder="Ex : Ancien soldat désabusé, plus doué avec les mots qu'avec l'épée."
            className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm outline-none focus:border-zinc-600"
          />
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-950 disabled:opacity-50"
        >
          {submitting ? "Création..." : "Commencer l'histoire"}
        </button>
      </form>
    </main>
  );
}
