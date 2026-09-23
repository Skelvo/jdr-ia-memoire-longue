import Anthropic from "@anthropic-ai/sdk";

let client: Anthropic | null = null;

export function getAnthropicClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("Missing ANTHROPIC_API_KEY env var.");
    }
    client = new Anthropic({ apiKey });
  }
  return client;
}

export const NARRATION_MODEL = "claude-sonnet-5";
export const BACKGROUND_MODEL = "claude-haiku-4-5-20251001";

// USD per token (list price, no prompt-caching discount applied). Used to
// estimate cost in the memory test script (SPEC.md §11) and any future cost
// dashboard (SPEC.md §8). Re-check against console.anthropic.com/pricing
// before relying on this for real billing figures.
export const PRICING = {
  [NARRATION_MODEL]: { input: 2 / 1_000_000, output: 10 / 1_000_000 },
  [BACKGROUND_MODEL]: { input: 1 / 1_000_000, output: 5 / 1_000_000 },
} as const;
