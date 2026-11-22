// Looks up which aisle a shopping item is in at your store, after the item is added, with the `claude` command
// (Claude Code, signed in on the server; it uses that subscription, no API key) and its web search.
// CAULDRON_STORE names the store (for example "Mariano's, <neighborhood>, <city>"); CAULDRON_AISLE_LOOKUP=off turns lookups off.
// Until the lookup answers, the item sits under a section guessed from its name (lib/sections.ts).
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { SECTIONS } from "./sections.ts";
import { addItem, cleanAisle, finishLookup, guessedItems, markLookingUp, type ItemChange, type ShoppingItem } from "./shopping.ts";

const run = promisify(execFile);
const LOOKUP_TIMEOUT_MS = 180_000;

let hasClaude: boolean | undefined;
export const lookupsEnabled = () => {
  if (process.env.CAULDRON_AISLE_LOOKUP === "off") return false;
  if (hasClaude === undefined) {
    try { execFileSync("claude", ["--version"], { stdio: "ignore", timeout: 10_000 }); hasClaude = true; } catch { hasClaude = false; }
  }
  return hasClaude;
};
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
  const { stdout } = await run(
    "claude",
    ["-p", prompt(name, where), "--output-format", "json", "--allowedTools", "WebSearch", "WebFetch", "--strict-mcp-config",
      "--disable-slash-commands", "--setting-sources", "", "--no-session-persistence", "--model", "sonnet"],
    { cwd: "data", maxBuffer: 10 * 1024 * 1024, timeout: LOOKUP_TIMEOUT_MS },
  );
  const reply = JSON.parse(stdout) as { result: string; is_error: boolean };
  if (reply.is_error) throw new Error(`claude failed: ${reply.result}`);
  return readAisle(reply.result);
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
