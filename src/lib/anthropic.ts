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
