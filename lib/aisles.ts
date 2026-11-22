// Places a shopping item in your store, after the item is added, with the `claude` command (Claude Code, signed in on
// the server; it uses that subscription, no API key). Claude gets the store map (lib/store-map.ts: what each aisle holds)
// and searches the web only when no aisle on the map fits.
// CAULDRON_STORE names the store (for example "Mariano's, <neighborhood>, <city>"); CAULDRON_AISLE_LOOKUP=off turns lookups off.
// Until the lookup answers, the item sits under a section guessed from its name (lib/sections.ts).
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { SECTIONS } from "./sections.ts";
import { readStoreMap, saveStoreMap, storeMapText } from "./store-map.ts";
import { addItem, cleanAisle, finishLookup, guessedItems, markLookingUp, type ItemChange, type ShoppingItem } from "./shopping.ts";

const run = promisify(execFile);
const LOOKUP_TIMEOUT_MS = 180_000;
const MAP_TIMEOUT_MS = 30 * 60_000; // the map research visits many product pages

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

What's known about this store's aisles:
${storeMap || "(nothing yet)"}

- If the item is sold in one of the edge departments, answer that department.
- If an aisle above clearly holds this kind of product, answer that aisle number without searching.
- Only if none fits, search the web for this exact store's aisle (Kroger-family stores show a product's aisle for a chosen store on their own product pages).
- If you still can't tell, answer "unknown". Never guess a number or name an area that isn't listed.

End your reply with one line of JSON and nothing after it: {"aisle": "<department, number, or unknown>"}`;

const claude = async (text: string, timeout: number) => {
  const { stdout } = await run(
    "claude",
    ["-p", text, "--output-format", "json", "--allowedTools", "WebSearch", "WebFetch", "--strict-mcp-config",
      "--disable-slash-commands", "--setting-sources", "", "--no-session-persistence", "--model", "sonnet"],
    { cwd: "data", maxBuffer: 10 * 1024 * 1024, timeout },
  );
  const reply = JSON.parse(stdout) as { result: string; is_error: boolean };
  if (reply.is_error) throw new Error(`claude failed: ${reply.result}`);
  return reply.result;
};

export const askClaude: AskAisle = async (name, where, storeMap) => readAisle(await claude(prompt(name, where, storeMap), LOOKUP_TIMEOUT_MS));

// Kinds of products the map research looks for, so it covers the whole middle of the store.
const KINDS = [
  "cereal", "oatmeal", "pancake mix and syrup", "coffee", "tea", "pasta", "pasta sauce", "rice and grains", "dry beans", "canned vegetables",
  "canned beans", "canned soup and broth", "canned tomatoes and tomato paste", "Asian foods (soy sauce, sesame oil, rice vinegar)",
  "Mexican foods (salsa, tortillas, pickled jalapeños)", "condiments (ketchup, mustard, mayo, hot sauce)", "salad dressing", "pickles and olives",
  "oils and vinegars", "spices and seasonings", "baking (flour, sugar, baking powder)", "stuffing and croutons", "nut butters and jam",
  "crackers", "chips", "cookies", "nuts and dried fruit", "juice", "soda and sparkling water", "bottled water", "sports drinks",
  "paper towels and toilet paper", "trash bags and foil", "dish soap and dishwasher detergent", "cleaning supplies", "laundry",
  "pet food", "baby", "vitamins", "pharmacy and first aid", "shampoo and soap", "oral care",
];

const mapPrompt = (where: string) => `Build an aisle directory for ${where}: which numbered aisle holds each kind of product below.

${AREAS(where)}

Search this exact store (Kroger-family stores show a product's aisle for a chosen store on their own product pages; search for typical products of each kind and read their aisle). Kinds:
${KINDS.map((k) => `- ${k}`).join("\n")}

Group what you find by aisle number. Include only aisles you found evidence for; leave out kinds you couldn't place rather than guessing.
End your reply with one line of JSON and nothing after it: {"aisles": [{"aisle": "<number>", "holds": ["<kind>", ...]}, ...]}`;

export type BuildMap = (where: string) => Promise<{ aisle: string; holds: string[] }[] | undefined>;
export const researchStoreMap: BuildMap = async (where) => readStoreMap(await claude(mapPrompt(where), MAP_TIMEOUT_MS));

let building: Promise<number> | undefined;
// Researches the store map in the background and saves it; then places every item whose aisle is still a guess.
// Returns false when a run is already going.
export function rebuildStoreMap(research: BuildMap = researchStoreMap, ask: AskAisle = askClaude): boolean {
  if (building) return false;
  building = (async () => {
    try {
      const entries = await research(store());
      if (entries) saveStoreMap(entries);
      else console.error("store map research gave no usable answer; keeping the old map");
      return entries?.length ?? 0;
    } catch (error) {
      console.error("store map research failed:", error instanceof Error ? error.message : error);
      return 0;
    } finally {
      building = undefined;
      lookUpGuessed(ask);
    }
  })();
  return true;
}
export const storeMapBuilding = () => building !== undefined;

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
export function addAndLookUp(change: ItemChange & { name: string }): ShoppingItem {
  const item = addItem(change, { lookUp: lookupsEnabled() });
  if (item.looking) void lookUp(item.id, item.name);
  return item;
}
