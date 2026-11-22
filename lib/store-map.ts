// The store's map: what each numbered aisle holds (from the store's signs or site), and which items are known to be in it
// (typed by you, remembered, or placed by a lookup), so a new item can be placed next to things of the same kind.
import { getDb } from "./db.ts";

export type AisleEntry = { aisle: string; holds: string; items: string[] };
export const MAX_HOLDS = 200;

// aisle -> what it holds, e.g. {"4": "Pasta, condiments"}.
export function getAisleContents(): Record<string, string> {
  const rows = getDb().prepare("SELECT aisle, holds FROM aisle_contents").all() as { aisle: string; holds: string }[];
  return Object.fromEntries(rows.map((r) => [r.aisle, r.holds]));
}

// Sets what a numbered aisle holds; empty text forgets it.
export function setAisleContents(aisle: string, holds: string): void {
  if (holds === "") getDb().prepare("DELETE FROM aisle_contents WHERE aisle = ?").run(aisle);
  else getDb().prepare("INSERT INTO aisle_contents (aisle, holds) VALUES (?, ?) ON CONFLICT (aisle) DO UPDATE SET holds = excluded.holds").run(aisle, holds);
}

const byNumber = (a: { aisle: string }, b: { aisle: string }) => Number(a.aisle) - Number(b.aisle);

export function getStoreMap(): AisleEntry[] {
  const known = getDb().prepare(`SELECT DISTINCT aisle, name FROM shopping_items
    WHERE aisle_from IN ('you', 'store', 'remembered') AND aisle GLOB '[0-9]*' ORDER BY name COLLATE NOCASE`).all() as { aisle: string; name: string }[];
  const contents = getAisleContents();
  const map = new Map<string, AisleEntry>(Object.entries(contents).map(([aisle, holds]) => [aisle, { aisle, holds, items: [] }]));
  for (const k of known) {
    if (!map.has(k.aisle)) map.set(k.aisle, { aisle: k.aisle, holds: "", items: [] });
    const entry = map.get(k.aisle)!;
    if (!entry.items.some((n) => n.toLowerCase() === k.name.toLowerCase())) entry.items.push(k.name);
  }
  return [...map.values()].sort((a, b) => Number(a.aisle) - Number(b.aisle));
}

// The map as lines a prompt can carry: "Aisle 5 (canned goods, soup): Chicken broth, Tomato paste".
export function storeMapText(map = getStoreMap()): string {
  return map.map((e) => `Aisle ${e.aisle}${e.holds ? ` (${e.holds})` : ""}: ${e.items.join(", ") || "no items yet"}`).join("\n");
}
