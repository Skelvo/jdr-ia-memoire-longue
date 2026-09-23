"use client";

import { useState } from "react";
import Link from "next/link";
import {
  WorldState,
  WorldCharacter,
  WorldLocation,
  WorldQuest,
} from "@/lib/types";

interface SummaryRow {
  id: number;
  level: number;
  from_turn: number;
  to_turn: number;
  content: string;
}

interface Props {
  worldId: string;
  title: string;
  initialState: WorldState;
  summaries: SummaryRow[];
}

const TABS = ["Personnages", "Lieux", "Quêtes", "Faits", "Résumé"] as const;
type Tab = (typeof TABS)[number];

export function CarnetClient({ worldId, title, initialState, summaries }: Props) {
  const [state, setState] = useState<WorldState>(initialState);
  const [tab, setTab] = useState<Tab>("Personnages");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function save(next: WorldState) {
    setState(next);
    setSaving(true);
    setSaved(false);
    const res = await fetch(`/api/worlds/${worldId}/state`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(next),
    });
    setSaving(false);
    setSaved(res.ok);
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-900 px-4 py-3">
        <div className="flex items-center gap-3">
          <Link href={`/play/${worldId}`} className="text-sm text-zinc-400">
            ← Retour
          </Link>
          <h1 className="truncate text-sm font-medium">Carnet — {title}</h1>
        </div>
        <span
          className={`text-xs text-zinc-500 transition-opacity ${
            saved ? "opacity-100" : "opacity-0"
          }`}
        >
          {saving ? "Enregistrement..." : "Enregistré"}
        </span>
      </header>

      <nav className="flex gap-1 overflow-x-auto border-b border-zinc-900 px-4 py-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`whitespace-nowrap rounded-full px-3 py-1.5 text-sm ${
              tab === t
                ? "bg-zinc-100 text-zinc-950"
                : "text-zinc-400 hover:text-zinc-200"
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      <div className="mx-auto max-w-2xl px-4 py-6">
        {tab === "Personnages" && (
          <CharacterList
            characters={state.characters}
            onChange={(characters) => save({ ...state, characters })}
          />
        )}
        {tab === "Lieux" && (
          <LocationList
            locations={state.locations}
            onChange={(locations) => save({ ...state, locations })}
          />
        )}
        {tab === "Quêtes" && (
          <QuestList
            quests={state.quests}
            onChange={(quests) => save({ ...state, quests })}
          />
        )}
        {tab === "Faits" && (
          <FactsAndRules
            facts={state.established_facts}
            rules={state.world_rules}
            onChangeFacts={(established_facts) => save({ ...state, established_facts })}
            onChangeRules={(world_rules) => save({ ...state, world_rules })}
          />
        )}
        {tab === "Résumé" && <SummaryList summaries={summaries} />}
      </div>
    </main>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      {children}
    </div>
  );
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs text-red-400 hover:text-red-300"
    >
      Supprimer
    </button>
  );
}

function CharacterList({
  characters,
  onChange,
}: {
  characters: WorldCharacter[];
  onChange: (v: WorldCharacter[]) => void;
}) {
  if (characters.length === 0) {
    return <EmptyState label="Aucun personnage rencontré pour l'instant." />;
  }
  return (
    <div className="space-y-3">
      {characters.map((c, i) => (
        <Card key={c.id || i}>
          <div className="mb-2 flex items-start justify-between gap-2">
            <input
              value={c.name}
              onChange={(e) =>
                onChange(
                  characters.map((x, j) =>
                    j === i ? { ...x, name: e.target.value } : x
                  )
                )
              }
              className="w-full bg-transparent text-sm font-medium outline-none"
            />
            <DeleteButton
              onClick={() => onChange(characters.filter((_, j) => j !== i))}
            />
          </div>
          <textarea
            value={c.description}
            onChange={(e) =>
              onChange(
                characters.map((x, j) =>
                  j === i ? { ...x, description: e.target.value } : x
                )
              )
            }
            rows={2}
            placeholder="Description"
            className="mb-2 w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
          />
          <div className="grid grid-cols-2 gap-2 text-xs">
            <LabeledInput
              label="Relation"
              value={c.relation_to_player}
              onChange={(v) =>
                onChange(
                  characters.map((x, j) =>
                    j === i ? { ...x, relation_to_player: v } : x
                  )
                )
              }
            />
            <LabeledInput
              label="Statut"
              value={c.status}
              onChange={(v) =>
                onChange(characters.map((x, j) => (j === i ? { ...x, status: v } : x)))
              }
            />
          </div>
        </Card>
      ))}
    </div>
  );
}

function LocationList({
  locations,
  onChange,
}: {
  locations: WorldLocation[];
  onChange: (v: WorldLocation[]) => void;
}) {
  if (locations.length === 0) {
    return <EmptyState label="Aucun lieu découvert pour l'instant." />;
  }
  return (
    <div className="space-y-3">
      {locations.map((l, i) => (
        <Card key={l.id || i}>
          <div className="mb-2 flex items-start justify-between gap-2">
            <input
              value={l.name}
              onChange={(e) =>
                onChange(
                  locations.map((x, j) =>
                    j === i ? { ...x, name: e.target.value } : x
                  )
                )
              }
              className="w-full bg-transparent text-sm font-medium outline-none"
            />
            <DeleteButton
              onClick={() => onChange(locations.filter((_, j) => j !== i))}
            />
          </div>
          <textarea
            value={l.description}
            onChange={(e) =>
              onChange(
                locations.map((x, j) =>
                  j === i ? { ...x, description: e.target.value } : x
                )
              )
            }
            rows={2}
            className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
          />
        </Card>
      ))}
    </div>
  );
}

function QuestList({
  quests,
  onChange,
}: {
  quests: WorldQuest[];
  onChange: (v: WorldQuest[]) => void;
}) {
  if (quests.length === 0) {
    return <EmptyState label="Aucune quête pour l'instant." />;
  }
  return (
    <div className="space-y-3">
      {quests.map((q, i) => (
        <Card key={q.id || i}>
          <div className="mb-2 flex items-start justify-between gap-2">
            <input
              value={q.title}
              onChange={(e) =>
                onChange(quests.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
              }
              className="w-full bg-transparent text-sm font-medium outline-none"
            />
            <DeleteButton onClick={() => onChange(quests.filter((_, j) => j !== i))} />
          </div>
          <select
            value={q.status}
            onChange={(e) =>
              onChange(
                quests.map((x, j) =>
                  j === i
                    ? { ...x, status: e.target.value as WorldQuest["status"] }
                    : x
                )
              )
            }
            className="mb-2 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs"
          >
            <option value="active">Active</option>
            <option value="done">Terminée</option>
            <option value="failed">Échouée</option>
          </select>
          <textarea
            value={q.details}
            onChange={(e) =>
              onChange(quests.map((x, j) => (j === i ? { ...x, details: e.target.value } : x)))
            }
            rows={2}
            className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm outline-none"
          />
        </Card>
      ))}
    </div>
  );
}

function FactsAndRules({
  facts,
  rules,
  onChangeFacts,
  onChangeRules,
}: {
  facts: string[];
  rules: string[];
  onChangeFacts: (v: string[]) => void;
  onChangeRules: (v: string[]) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="mb-2 text-sm font-medium text-zinc-400">Faits établis</h2>
        <StringList items={facts} onChange={onChangeFacts} />
      </div>
      <div>
        <h2 className="mb-2 text-sm font-medium text-zinc-400">Règles du monde</h2>
        <StringList items={rules} onChange={onChangeRules} />
      </div>
    </div>
  );
}

function StringList({
  items,
  onChange,
}: {
  items: string[];
  onChange: (v: string[]) => void;
}) {
  if (items.length === 0) {
    return <EmptyState label="Rien pour l'instant." />;
  }
  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={i} className="flex items-start gap-2">
          <textarea
            value={item}
            onChange={(e) =>
              onChange(items.map((x, j) => (j === i ? e.target.value : x)))
            }
            rows={1}
            className="w-full resize-none rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm outline-none"
          />
          <DeleteButton onClick={() => onChange(items.filter((_, j) => j !== i))} />
        </div>
      ))}
    </div>
  );
}

function SummaryList({ summaries }: { summaries: SummaryRow[] }) {
  if (summaries.length === 0) {
    return <EmptyState label="Pas encore de résumé (généré tous les 20 tours)." />;
  }
  return (
    <div className="space-y-3">
      {summaries.map((s) => (
        <Card key={s.id}>
          <p className="mb-1 text-xs text-zinc-500">
            {s.level === 2 ? "Méta-résumé" : "Résumé"} — tours {s.from_turn} à {s.to_turn}
          </p>
          <p className="text-sm leading-relaxed text-zinc-300">{s.content}</p>
        </Card>
      ))}
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-zinc-500">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 outline-none"
      />
    </label>
  );
}

function EmptyState({ label }: { label: string }) {
  return <p className="text-sm text-zinc-500">{label}</p>;
}
