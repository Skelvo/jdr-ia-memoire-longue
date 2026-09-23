// Script de test "mémoire longue" — SPEC.md §11 (test clé) et §14 (définition
// de "terminé" pour la Phase 1).
//
// 1. Crée un monde de test (utilisateur jetable, supprimé à la fin).
// 2. Simule 150 tours avec un joueur scripté.
// 3. Plante des faits aux tours 5, 15, 30.
// 4. Aux tours 100, 120, 140, pose des questions de rappel.
// 5. Vérifie (LLM-juge Haiku) que le MJ s'en souvient et ne se contredit pas.
// 6. Affiche un rapport : taux de rappel, contradictions, coût total, taille
//    de la fiche.
//
// Usage : npm run test:memory
// Nécessite ANTHROPIC_API_KEY (et les variables Supabase) dans .env.local.

import { config } from "dotenv";
config({ path: ".env.local" });

import { z } from "zod";
import {
  getAnthropicClient,
  NARRATION_MODEL,
  BACKGROUND_MODEL,
  PRICING,
} from "../src/lib/anthropic";
import { buildTurnContext } from "../src/lib/context";
import { gameMasterSystemPrompt } from "../src/lib/prompts";
import { createServiceSupabaseClient } from "../src/lib/supabase/service";
import { runMemoryWorker } from "../src/lib/worker";
import { emptyWorldState } from "../src/lib/types";

const TOTAL_TURNS = 150;
const GENRE = "Fantasy";
const TONE = "Épique";
const PLAYER_NAME = "Testeur";

interface PlantedFact {
  turn: number;
  playerMessage: string;
  fact: string; // used only for the report / judge prompt
}

interface RecallCheck {
  turn: number;
  question: string;
  fact: string;
  expectedKeywords: string[]; // cheap fallback check alongside the LLM judge
}

const PLANTED_FACTS: PlantedFact[] = [
  {
    turn: 5,
    playerMessage:
      "Je demande son nom au forgeron du village. Il me répond qu'il s'appelle Karn, et je remarque qu'il évite soigneusement de s'approcher des flammes de sa propre forge, visiblement terrifié par le feu.",
    fact: "Le forgeron s'appelle Karn et a peur du feu.",
  },
  {
    turn: 15,
    playerMessage:
      "Je prends la main d'Elyra et je lui promets solennellement que je reviendrai avant que l'hiver ne s'installe sur la région.",
    fact: "Le joueur a promis à Elyra de revenir avant l'hiver.",
  },
  {
    turn: 30,
    playerMessage:
      "Au plus fort du combat, mon épée se brise net contre le bouclier de mon adversaire. Je me retrouve désarmé, ne tenant plus qu'une poignée inutile.",
    fact: "L'épée du joueur est cassée.",
  },
];

const RECALL_CHECKS: RecallCheck[] = [
  {
    turn: 100,
    question:
      "Je m'arrête un instant et je repense au forgeron du village. Te souviens-tu de son nom, et de ce qui le terrifiait ?",
    fact: "Le forgeron s'appelle Karn et a peur du feu.",
    expectedKeywords: ["karn"],
  },
  {
    turn: 120,
    question:
      "Je me demande soudain si j'ai fait une promesse à quelqu'un récemment. En ai-je fait une, et à qui ?",
    fact: "Le joueur a promis à Elyra de revenir avant l'hiver.",
    expectedKeywords: ["elyra"],
  },
  {
    turn: 140,
    question: "Je vérifie mon arme. Dans quel état est mon épée ?",
    fact: "L'épée du joueur est cassée.",
    expectedKeywords: ["cass", "bris"],
  },
];

const FILLER_ACTIONS = [
  "J'explore les environs à la recherche d'indices.",
  "Je parle aux villageois pour en apprendre plus sur la région.",
  "Je continue mon chemin sur la route principale.",
  "Je me repose un moment avant de reprendre la route.",
  "J'observe attentivement les alentours.",
  "Je fouille mes affaires pour vérifier ce qu'il me reste.",
  "Je réfléchis un instant à la situation avant d'agir.",
  "Je m'approche prudemment du prochain point d'intérêt.",
  "Je cherche un abri pour la nuit qui approche.",
  "Je reprends la route au lever du jour.",
];

const judgeOutputSchema = z.object({
  remembers: z.boolean(),
  contradicts: z.boolean(),
  reasoning: z.string(),
});

interface Usage {
  inputTokens: number;
  outputTokens: number;
}

function addUsage(total: Record<string, Usage>, model: string, u: { input_tokens: number; output_tokens: number }) {
  const entry = total[model] ?? { inputTokens: 0, outputTokens: 0 };
  entry.inputTokens += u.input_tokens;
  entry.outputTokens += u.output_tokens;
  total[model] = entry;
}

function estimateCost(total: Record<string, Usage>): number {
  let cost = 0;
  for (const [model, u] of Object.entries(total)) {
    const price = PRICING[model as keyof typeof PRICING];
    if (!price) continue;
    cost += u.inputTokens * price.input + u.outputTokens * price.output;
  }
  return cost;
}

async function playerMessageForTurn(turn: number): Promise<string> {
  const planted = PLANTED_FACTS.find((f) => f.turn === turn);
  if (planted) return planted.playerMessage;

  const recall = RECALL_CHECKS.find((r) => r.turn === turn);
  if (recall) return recall.question;

  return FILLER_ACTIONS[turn % FILLER_ACTIONS.length];
}

// Runs one turn synchronously (non-streaming, unlike the real /api/turn route)
// and returns the MJ's full response text + token usage, per the same
// pipeline described in SPEC.md §5.
async function runTurnSync(
  worldId: string,
  message: string,
  usage: Record<string, Usage>
): Promise<string> {
  const supabase = createServiceSupabaseClient();
  const anthropic = getAnthropicClient();

  const { data: world } = await supabase
    .from("worlds")
    .select("turn_count")
    .eq("id", worldId)
    .single();
  const nextTurn = world!.turn_count + 1;

  const context = await buildTurnContext(worldId);

  await supabase.from("messages").insert({
    world_id: worldId,
    turn_index: nextTurn,
    role: "user",
    content: message,
  });

  const res = await anthropic.messages.create({
    model: NARRATION_MODEL,
    max_tokens: 900,
    system: [
      {
        type: "text",
        text: gameMasterSystemPrompt(TONE, GENRE),
        cache_control: { type: "ephemeral" },
      },
      {
        type: "text",
        text: [
          "FICHE DU MONDE:",
          JSON.stringify(context.worldState),
          "",
          "RÉSUMÉS (du plus ancien au plus récent):",
          context.summaries.join("\n---\n") || "(aucun résumé pour l'instant)",
        ].join("\n"),
      },
    ],
    messages: [
      ...context.recentMessages.map((m) => ({ role: m.role, content: m.content })),
      { role: "user" as const, content: message },
    ],
  });
  addUsage(usage, NARRATION_MODEL, res.usage);

  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");

  await supabase.from("messages").insert({
    world_id: worldId,
    turn_index: nextTurn,
    role: "assistant",
    content: text,
  });

  await supabase
    .from("worlds")
    .update({ turn_count: nextTurn, updated_at: new Date().toISOString() })
    .eq("id", worldId);

  // Awaited (not fire-and-forget) so the test stays deterministic turn-by-turn.
  const { usage: workerUsage } = await runMemoryWorker(worldId, nextTurn);
  const entry = usage[BACKGROUND_MODEL] ?? { inputTokens: 0, outputTokens: 0 };
  entry.inputTokens += workerUsage.inputTokens;
  entry.outputTokens += workerUsage.outputTokens;
  usage[BACKGROUND_MODEL] = entry;

  return text;
}

async function judgeRecall(
  fact: string,
  mjResponse: string,
  usage: Record<string, Usage>
): Promise<{ remembers: boolean; contradicts: boolean; reasoning: string }> {
  const anthropic = getAnthropicClient();
  const res = await anthropic.messages.create({
    model: BACKGROUND_MODEL,
    max_tokens: 300,
    system:
      'Tu évalues si un maître du jeu se souvient correctement d\'un fait établi. Réponds uniquement avec un JSON strict : {"remembers": bool, "contradicts": bool, "reasoning": "1 phrase"}.',
    messages: [
      {
        role: "user",
        content: `FAIT ÉTABLI: ${fact}\n\nRÉPONSE DU MJ:\n${mjResponse}\n\nLe MJ montre-t-il qu'il se souvient de ce fait (remembers) ? Le contredit-il explicitement (contradicts) ?`,
      },
    ],
  });
  addUsage(usage, BACKGROUND_MODEL, res.usage);

  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
  return judgeOutputSchema.parse(JSON.parse(text));
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY manquant dans .env.local — impossible de lancer le test.");
    process.exit(1);
  }

  const supabase = createServiceSupabaseClient();
  const usage: Record<string, Usage> = {};

  console.log("Création de l'utilisateur et du monde de test...");
  const testEmail = `memory-test-${Date.now()}@example.invalid`;
  const { data: userRes, error: userErr } = await supabase.auth.admin.createUser({
    email: testEmail,
    email_confirm: true,
  });
  if (userErr || !userRes.user) {
    throw new Error(`Impossible de créer l'utilisateur de test: ${userErr?.message}`);
  }
  const userId = userRes.user.id;

  const { data: world, error: worldErr } = await supabase
    .from("worlds")
    .insert({
      user_id: userId,
      title: "Test mémoire longue",
      premise: "Monde de test généré par scripts/memory-test.ts (SPEC.md §11).",
      genre: GENRE,
      tone: TONE,
      player_character: { name: PLAYER_NAME, description: "Personnage de test." },
    })
    .select("id")
    .single();
  if (worldErr || !world) {
    throw new Error(`Impossible de créer le monde de test: ${worldErr?.message}`);
  }
  const worldId = world.id as string;

  const initialState = structuredClone(emptyWorldState);
  initialState.player.name = PLAYER_NAME;
  await supabase.from("world_state").insert({ world_id: worldId, state: initialState, version: 1 });
  await supabase.from("world_state_history").insert({
    world_id: worldId,
    version: 1,
    state: initialState,
    diff: null,
    source: "player",
    turn_index: null,
  });

  const recallResults: { turn: number; fact: string; remembers: boolean; contradicts: boolean; reasoning: string }[] = [];

  try {
    for (let turn = 1; turn <= TOTAL_TURNS; turn++) {
      const message = await playerMessageForTurn(turn);
      process.stdout.write(`Tour ${turn}/${TOTAL_TURNS}...\r`);
      const mjResponse = await runTurnSync(worldId, message, usage);

      const recall = RECALL_CHECKS.find((r) => r.turn === turn);
      if (recall) {
        const judged = await judgeRecall(recall.fact, mjResponse, usage);
        const keywordHit = recall.expectedKeywords.some((k) =>
          mjResponse.toLowerCase().includes(k)
        );
        recallResults.push({
          turn,
          fact: recall.fact,
          // A recall counts if either the LLM judge or the keyword fallback agrees —
          // guards against the judge itself hallucinating a false negative.
          remembers: judged.remembers || keywordHit,
          contradicts: judged.contradicts,
          reasoning: judged.reasoning,
        });
      }
    }
  } finally {
    console.log("\nNettoyage...");
    const { data: finalState } = await supabase
      .from("world_state")
      .select("state")
      .eq("world_id", worldId)
      .maybeSingle();
    const fichSize = finalState ? JSON.stringify(finalState.state).length : 0;

    // Cleanup: cascades delete worlds/world_state/messages/etc via FK, per the schema.
    await supabase.from("worlds").delete().eq("id", worldId);
    await supabase.auth.admin.deleteUser(userId);

    printReport(recallResults, usage, fichSize);
  }
}

function printReport(
  recallResults: { turn: number; fact: string; remembers: boolean; contradicts: boolean; reasoning: string }[],
  usage: Record<string, Usage>,
  finalFicheCharSize: number
) {
  const total = recallResults.length;
  const remembered = recallResults.filter((r) => r.remembers).length;
  const contradictions = recallResults.filter((r) => r.contradicts).length;
  const cost = estimateCost(usage);
  // Rough estimate (chars/4); SPEC.md's 2 500-token target is itself approximate.
  const ficheTokensEstimate = Math.round(finalFicheCharSize / 4);

  console.log("\n=== Rapport de test mémoire (SPEC.md §11) ===\n");
  console.log(`Tours joués            : ${TOTAL_TURNS}`);
  console.log(`Taux de rappel         : ${remembered}/${total} (${Math.round((remembered / total) * 100)}%)`);
  console.log(`Contradictions détectées: ${contradictions}/${total}`);
  console.log(`Taille finale de la fiche (estimée) : ~${ficheTokensEstimate} tokens`);
  console.log(`Coût total estimé       : $${cost.toFixed(4)}`);
  console.log("\nDétail par question de rappel :");
  for (const r of recallResults) {
    const status = r.remembers ? "✅ souvenu" : "❌ oublié";
    const flag = r.contradicts ? " ⚠️ CONTRADICTION" : "";
    console.log(`  Tour ${r.turn} — ${r.fact}`);
    console.log(`    ${status}${flag} — ${r.reasoning}`);
  }
  console.log("");

  if (remembered < total || contradictions > 0) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Le test a échoué:", err);
  process.exit(1);
});
