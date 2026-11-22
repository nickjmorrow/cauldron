// Looks up which aisle a shopping item is in at your store, with Claude and web search, after the item is added.
// Needs ANTHROPIC_API_KEY on the server; CAULDRON_STORE names the store (for example "Mariano's, <neighborhood>, <city>").
// Until the lookup answers, the item sits under a section guessed from its name (lib/sections.ts).
import Anthropic from "@anthropic-ai/sdk";
import { SECTIONS } from "./sections.ts";
import { addItem, cleanAisle, finishLookup, guessedItems, markLookingUp, type ItemChange, type ShoppingItem } from "./shopping.ts";

const MODEL = "claude-opus-5-5";
const MAX_CONTINUES = 3; // server tool loops can pause; each resume carries on where it stopped

export const lookupsEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);
const store = () => process.env.CAULDRON_STORE?.trim() || "a typical US grocery store";

// One item's aisle: a number when the store's own aisle was found, else one of SECTIONS. Undefined when there was no usable answer.
export type AskAisle = (name: string, store: string) => Promise<string | undefined>;

// Pulls {"aisle": "..."} out of the model's last text, accepting only an aisle number or one of the sections.
export function readAisle(text: string): string | undefined {
  const match = text.match(/\{[^{}]*"aisle"[^{}]*\}/g)?.at(-1);
  if (!match) return undefined;
  let aisle: unknown;
  try { aisle = (JSON.parse(match) as { aisle?: unknown }).aisle; } catch { return undefined; }
  if (typeof aisle !== "string") return undefined;
  const cleaned = cleanAisle(aisle.trim());
  if (/^\d{1,3}$/.test(cleaned)) return cleaned;
  return SECTIONS.find((s) => s.toLowerCase() === cleaned.toLowerCase());
}

const prompt = (name: string, where: string) => `Which aisle is "${name}" in at ${where}?

Search for this exact store. Kroger-family stores show a product's aisle for a chosen store on their own site; store maps and aisle directories help too.
- If you find this store's aisle number for the item (or a close equivalent product), answer that number.
- Otherwise answer the store section it is usually in, exactly one of: ${SECTIONS.join(", ")}.

End your reply with one line of JSON and nothing after it: {"aisle": "<number or section>"}`;

export const askClaude: AskAisle = async (name, where) => {
  const client = new Anthropic();
  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: prompt(name, where) }];
  for (let turn = 0; turn <= MAX_CONTINUES; turn++) {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low" },
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: 4 },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3 },
      ],
      messages,
    });
    if (response.stop_reason === "pause_turn") {
      messages.push({ role: "assistant", content: response.content });
      continue;
    }
    if (response.stop_reason === "refusal") return undefined;
    const text = response.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
    return readAisle(text);
  }
  return undefined;
};

// Looks up one item and stores the answer. Never throws: a failed lookup leaves the guessed section.
export async function lookUp(id: number, name: string, ask: AskAisle = askClaude): Promise<void> {
  let aisle: string | undefined;
  try {
    aisle = await ask(name, store());
  } catch (error) {
    console.error(`aisle lookup for "${name}" failed:`, error instanceof Error ? error.message : error);
  }
  finishLookup(id, aisle);
}

// Looks up every open item whose aisle is only a guess, one at a time in the background (each shows as looking
// until its turn ends), so a long list doesn't hit the API's rate limits. Returns how many are queued.
export function lookUpGuessed(ask: AskAisle = askClaude): number {
  const items = guessedItems();
  for (const item of items) markLookingUp(item.id);
  void (async () => {
    for (const item of items) await lookUp(item.id, item.name, ask);
  })();
  return items.length;
}

// Adds an item and, when its aisle is only a guess, starts looking up the store's aisle in the background.
export function addAndLookUp(change: ItemChange & { name: string }): ShoppingItem {
  const item = addItem(change, { lookUp: lookupsEnabled() });
  if (item.looking) void lookUp(item.id, item.name);
  return item;
}
