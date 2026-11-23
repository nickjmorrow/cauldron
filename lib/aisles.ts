// Places a shopping item in your store a few seconds after it's added, with the `claude` command (Claude Code, signed in
// on the server; it uses that subscription, no API key). Claude gets the store map (lib/store-map.ts: the aisles your
// items are known to be in) and the store's departments, and answers from those alone: no web search, so it's quick.
// Anything it can't place waits under "No aisle yet" until you type its aisle once.
// CAULDRON_STORE names the store (for example "Mariano's, <neighborhood>, <city>"); CAULDRON_AISLE_LOOKUP=off turns lookups off.
// Until the lookup answers, the item sits under a section guessed from its name (lib/sections.ts).
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { attachProductPhoto, krogerEnabled } from "./kroger.ts";
import { SECTIONS } from "./sections.ts";
import { storeMapText } from "./store-map.ts";
import { addItem, cleanAisle, finishLookup, guessedItems, markLookingUp, type ItemChange, type ShoppingItem } from "./shopping.ts";

const run = promisify(execFile);
const LOOKUP_TIMEOUT_MS = 60_000;

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
export type AskAisle = (name: string, store: string, storeMap: string) => Promise<string | undefined>;

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

const AREAS = (where: string) => `The only named areas at ${where} are the departments around the edge: ${SECTIONS.join(", ")}. \
Everything else is in a numbered aisle; there is no "pantry", "condiments" or "household" area.`;

const prompt = (name: string, where: string, storeMap: string) => `Which aisle is "${name}" in at ${where}?

${AREAS(where)}

The aisles known so far, with items found in them:
${storeMap || "(none yet)"}

- If it's sold in one of the edge departments, answer that department.
- If a known aisle holds the same kind of product (or one shelved with it, like soy sauce and sriracha in an Asian foods aisle), answer that aisle number.
- Otherwise answer "unknown". Never invent an aisle number or an area that isn't listed.

Reply with only one line of JSON: {"aisle": "<department, number, or unknown>"}`;

export const askClaude: AskAisle = async (name, where, storeMap) => {
  const { stdout } = await run(
    "claude",
    ["-p", prompt(name, where, storeMap), "--output-format", "json", "--tools", "", "--strict-mcp-config", "--disable-slash-commands",
      "--setting-sources", "", "--no-session-persistence", "--model", "haiku"],
    { cwd: "data", maxBuffer: 1024 * 1024, timeout: LOOKUP_TIMEOUT_MS },
  );
  const reply = JSON.parse(stdout) as { result: string; is_error: boolean };
  if (reply.is_error) throw new Error(`claude failed: ${reply.result}`);
  return readAisle(reply.result);
};

// Looks up one item and stores the answer. Never throws: a failed lookup leaves the guessed section.
export async function lookUp(id: number, name: string, ask: AskAisle = askClaude): Promise<void> {
  let aisle: string | undefined;
  try {
    aisle = await ask(name, store(), storeMapText());
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
// An item with no photo also gets the picture of the product it names, when the store's catalog is set up (lib/kroger.ts).
export function addAndLookUp(change: ItemChange & { name: string }): ShoppingItem {
  const item = addItem(change, { lookUp: lookupsEnabled() });
  if (item.looking) void lookUp(item.id, item.name);
  if (!item.photo && krogerEnabled()) void attachProductPhoto(item.id, item.name, { onlyBranded: true });
  return item;
}
