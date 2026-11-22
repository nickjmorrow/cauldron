// The store's map: what each numbered aisle holds ("canned soup, broth"), so an item can be placed from what's
// known about the store instead of a web search per item. Built once by a research run with the `claude` command
// (web search on the store's own product pages), and added to by every aisle you type or a lookup confirms.
import { getDb } from "./db.ts";
import { cleanAisle } from "./shopping.ts";

export type AisleEntry = { aisle: string; holds: string[]; items: string[] }; // items: things on your list known to be there
const MAX_HOLDS = 40;

const byNumber = (a: { aisle: string }, b: { aisle: string }) => Number(a.aisle) - Number(b.aisle);

// The researched aisles plus, for every numbered aisle, the items you've typed or a lookup confirmed there.
export function getStoreMap(): AisleEntry[] {
  const db = getDb();
  const rows = db.prepare("SELECT aisle, holds FROM store_aisles").all() as { aisle: string; holds: string }[];
  const map = new Map<string, AisleEntry>(rows.map((r) => [r.aisle, { aisle: r.aisle, holds: JSON.parse(r.holds) as string[], items: [] }]));
  const known = db.prepare(`SELECT DISTINCT aisle, name FROM shopping_items
    WHERE aisle_from IN ('you', 'store', 'remembered') AND aisle GLOB '[0-9]*' ORDER BY name COLLATE NOCASE`).all() as { aisle: string; name: string }[];
  for (const k of known) {
    if (!map.has(k.aisle)) map.set(k.aisle, { aisle: k.aisle, holds: [], items: [] });
    const entry = map.get(k.aisle)!;
    if (!entry.items.some((n) => n.toLowerCase() === k.name.toLowerCase())) entry.items.push(k.name);
  }
  return [...map.values()].sort(byNumber);
}

// The map as lines a prompt can carry: "Aisle 9: canned soup, broth (on the list before: Low-sodium chicken broth)".
export function storeMapText(map = getStoreMap()): string {
  return map.map((e) => {
    const holds = e.holds.length ? e.holds.join(", ") : "contents not researched";
    return `Aisle ${e.aisle}: ${holds}${e.items.length ? ` (on the list before: ${e.items.join(", ")})` : ""}`;
  }).join("\n");
}

// Reads {"aisles": [{"aisle": "9", "holds": [...]}, ...]} from a research reply; keeps only numbered aisles with contents.
export function readStoreMap(text: string): { aisle: string; holds: string[] }[] | undefined {
  const start = text.lastIndexOf('{"aisles"');
  const body = start === -1 ? text.slice(text.indexOf("{")) : text.slice(start);
  let parsed: unknown;
  try { parsed = JSON.parse(body.slice(0, body.lastIndexOf("}") + 1)); } catch { return undefined; }
  const aisles = (parsed as { aisles?: unknown }).aisles;
  if (!Array.isArray(aisles)) return undefined;
  const entries = aisles.flatMap((a) => {
    const aisle = cleanAisle(String((a as { aisle?: unknown }).aisle ?? "").trim());
    const holds = (a as { holds?: unknown }).holds;
    if (!/^\d{1,3}$/.test(aisle) || !Array.isArray(holds)) return [];
    const kinds = holds.filter((h): h is string => typeof h === "string").map((h) => h.trim()).filter(Boolean).slice(0, MAX_HOLDS);
    return kinds.length ? [{ aisle, holds: kinds }] : [];
  });
  return entries.length ? entries : undefined;
}

// Replaces the researched part of the map (items you've placed are kept: they live on the shopping items).
export function saveStoreMap(entries: { aisle: string; holds: string[] }[]): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    db.exec("DELETE FROM store_aisles");
    const insert = db.prepare("INSERT INTO store_aisles (aisle, holds, updated_at) VALUES (?, ?, ?)");
    for (const e of entries) insert.run(e.aisle, JSON.stringify(e.holds), now);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function storeMapUpdated(): string {
  const row = getDb().prepare("SELECT MAX(updated_at) AS at FROM store_aisles").get() as { at: string | null };
  return row.at ?? "";
}
