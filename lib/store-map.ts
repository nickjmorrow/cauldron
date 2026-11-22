// The store's map: which items are known to be in each numbered aisle (typed by you, remembered, or placed by a
// lookup), so a new item can be placed next to things of the same kind.
import { getDb } from "./db.ts";

export type AisleEntry = { aisle: string; items: string[] };

const byNumber = (a: { aisle: string }, b: { aisle: string }) => Number(a.aisle) - Number(b.aisle);

export function getStoreMap(): AisleEntry[] {
  const known = getDb().prepare(`SELECT DISTINCT aisle, name FROM shopping_items
    WHERE aisle_from IN ('you', 'store', 'remembered') AND aisle GLOB '[0-9]*' ORDER BY name COLLATE NOCASE`).all() as { aisle: string; name: string }[];
  const map = new Map<string, AisleEntry>();
  for (const k of known) {
    if (!map.has(k.aisle)) map.set(k.aisle, { aisle: k.aisle, items: [] });
    const entry = map.get(k.aisle)!;
    if (!entry.items.some((n) => n.toLowerCase() === k.name.toLowerCase())) entry.items.push(k.name);
  }
  return [...map.values()].sort((a, b) => Number(a.aisle) - Number(b.aisle));
}

// The map as lines a prompt can carry: "Aisle 9: Low-sodium chicken broth, Tomato paste".
export function storeMapText(map = getStoreMap()): string {
  return map.map((e) => `Aisle ${e.aisle}: ${e.items.join(", ")}`).join("\n");
}
