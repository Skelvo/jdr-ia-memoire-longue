"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { StoredMessage } from "@/lib/types";

interface Props {
  worldId: string;
  title: string;
  genre: string;
  tone: string;
  initialMessages: StoredMessage[];
}

interface DisplayMessage {
  role: "user" | "assistant";
  content: string;
}

export function GameScreen({ worldId, title, genre, tone, initialMessages }: Props) {
  const [messages, setMessages] = useState<DisplayMessage[]>(
    initialMessages.map((m) => ({ role: m.role, content: m.content }))
  );
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [undoing, setUndoing] = useState(false);
  const [memoryUpdated, setMemoryUpdated] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Streams one turn for `message`, appending a user bubble + a live assistant
  // bubble. Shared by the normal send flow and "Régénérer" (SPEC.md §9 UX).
  async function runTurn(message: string) {
    setMemoryUpdated(false);
    setMessages((prev) => [
      ...prev,
      { role: "user", content: message },
      { role: "assistant", content: "" },
    ]);
    setStreaming(true);

    try {
      const res = await fetch("/api/turn", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ worldId, message, tone, genre }),
      });

      if (!res.body) throw new Error("Pas de flux de réponse.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Parses the "data: {...}\n\n" SSE framing emitted by /api/turn.
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const events = buffer.split("\n\n");
        buffer = events.pop() ?? "";

        for (const evt of events) {
          const line = evt.replace(/^data: /, "").trim();
          if (!line || line === "[DONE]") continue;

          const payload = JSON.parse(line) as { delta?: string; error?: string };
          if (payload.delta) {
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = {
                role: "assistant",
                content: next[next.length - 1].content + payload.delta,
              };
              return next;
            });
          }
          if (payload.error) {
            setMessages((prev) => {
              const next = [...prev];
              next[next.length - 1] = { role: "assistant", content: payload.error! };
              return next;
            });
          }
        }

        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
      }

      setMemoryUpdated(true);
    } catch {
      setMessages((prev) => {
        const next = [...prev];
        next[next.length - 1] = {
          role: "assistant",
          content: "Le MJ a rencontré un problème, réessaie.",
        };
        return next;
      });
    } finally {
      setStreaming(false);
    }
  }

  async function sendTurn(e: React.FormEvent) {
    e.preventDefault();
    const message = input.trim();
    if (!message || streaming) return;
    setInput("");
    await runTurn(message);
  }

  // "Annuler le dernier tour": drops the last exchange and rolls the world
  // sheet back server-side (POST /api/turn/undo), then removes it locally.
  async function undoLastTurn() {
    if (streaming || undoing || messages.length === 0) return;
    setUndoing(true);
    const res = await fetch("/api/turn/undo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ worldId }),
    });
    if (res.ok) {
      setMessages((prev) => prev.slice(0, -2));
      setMemoryUpdated(false);
    }
    setUndoing(false);
  }

  // "Régénérer la dernière réponse": undo, then replay the same player message.
  async function regenerate() {
    if (streaming || undoing || messages.length === 0) return;
    const lastUser = [...messages].reverse().find((m) => m.role === "user");
    if (!lastUser) return;

    setUndoing(true);
    const res = await fetch("/api/turn/undo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ worldId }),
    });
    setUndoing(false);

    if (res.ok) {
      setMessages((prev) => prev.slice(0, -2));
      await runTurn(lastUser.content);
    }
  }

  const canUndo = messages.length > 0 && !streaming && !undoing;

  return (
    <main className="flex h-dvh flex-col bg-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between border-b border-zinc-900 px-4 py-3">
        <h1 className="truncate text-sm font-medium">{title}</h1>
        <div className="flex items-center gap-3">
          <span
            className={`text-xs text-zinc-500 transition-opacity ${
              memoryUpdated ? "opacity-100" : "opacity-0"
            }`}
          >
            Carnet mis à jour
          </span>
          <Link
            href={`/play/${worldId}/carnet`}
            className="rounded-full border border-zinc-800 px-3 py-1 text-xs text-zinc-300"
          >
            Carnet
          </Link>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-6">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
              m.role === "user"
                ? "ml-auto bg-zinc-100 text-zinc-950"
                : "bg-zinc-900 text-zinc-100"
            }`}
          >
            {m.content || (m.role === "assistant" && streaming ? "…" : "")}
          </div>
        ))}

        {canUndo && (
          <div className="flex gap-2 pt-1 text-xs text-zinc-500">
            <button onClick={regenerate} className="hover:text-zinc-300">
              Régénérer la dernière réponse
            </button>
            <span>·</span>
            <button onClick={undoLastTurn} className="hover:text-zinc-300">
              Annuler le dernier tour
            </button>
          </div>
        )}
      </div>

      <form
        onSubmit={sendTurn}
        className="flex items-end gap-2 border-t border-zinc-900 p-3"
      >
        <textarea
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              sendTurn(e);
            }
          }}
          placeholder="Que fais-tu ?"
          className="flex-1 resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-2.5 text-sm outline-none focus:border-zinc-600"
        />
        <button
          type="submit"
          disabled={streaming || !input.trim()}
          className="rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-950 disabled:opacity-50"
        >
          Envoyer
        </button>
      </form>
    </main>
  );
}
