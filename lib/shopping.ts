// The shopping list: things to buy, grouped by the store aisle they're in, with a "later" pile for things
// that aren't for this trip. Checked-off items stay until they're cleared, so a mistaken tap can be undone.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDb, PHOTOS_DIR } from "./db.ts";
import { guessSection, sectionRank } from "./sections.ts";

// photo is a version token (when the photo was set), or "" when there is none; the image is at /api/shopping/<id>/photo.
// aisleFrom: where the aisle came from ('you', 'remembered', 'store' when looked up, 'guess' from the name, or '').
// looking: the store's aisle is being looked up right now. meals: the meals or recipes it's bought for.
export type ShoppingItem = {
  id: number; name: string; qty: string; aisle: string; later: boolean; done: boolean; note: string; photo: string;
  aisleFrom: string; looking: boolean; meals: string[];
};
export type ShoppingGroup = { title: string; items: ShoppingItem[] };
export type ShoppingList = { groups: ShoppingGroup[]; done: ShoppingItem[] };
export type ItemChange = Partial<Omit<ShoppingItem, "id" | "photo" | "aisleFrom" | "looking">>;

export const NO_AISLE = "No aisle yet";
const MAX_MEALS = 10;
const TEXT_FIELDS = ["name", "qty", "aisle", "note"] as const;
const FLAG_FIELDS = ["later", "done"] as const;
const MAX_TEXT = 200;
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
// Read from the file's first bytes, not from what the sender claims.
const IMAGE_SIGNATURES: { type: string; matches: (b: Uint8Array) => boolean }[] = [
  { type: "image/jpeg", matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: "image/png", matches: (b) => b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 },
  { type: "image/webp", matches: (b) => String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP" },
  { type: "image/gif", matches: (b) => String.fromCharCode(...b.slice(0, 4)) === "GIF8" },
];

type Row = {
  id: number; name: string; qty: string; aisle: string; later: number; note: string; done_at: string | null; photo_type: string; photo_at: string;
  aisle_from: string; lookup: number; meals: string;
};
const toItem = (r: Row): ShoppingItem => ({
  id: r.id, name: r.name, qty: r.qty, aisle: r.aisle, later: r.later === 1, done: r.done_at !== null, note: r.note,
  photo: r.photo_type ? r.photo_at : "", aisleFrom: r.aisle_from, looking: r.lookup === 1, meals: JSON.parse(r.meals) as string[],
});
const COLUMNS = "id, name, qty, aisle, later, note, done_at, photo_type, photo_at, aisle_from, lookup, meals";

// "4" reads as "Aisle 4"; a named area such as "Produce" is shown as written.
export function aisleTitle(aisle: string): string {
  if (!aisle) return NO_AISLE;
  return /^\d+$/.test(aisle) ? `Aisle ${Number(aisle)}` : aisle;
}

// "Aisle 04" and "4" are the same aisle; stored as "4".
export function cleanAisle(text: string): string {
  const aisle = text.replace(/^aisle\s+/i, "");
  return /^\d+$/.test(aisle) ? String(Number(aisle)) : aisle;
}

// Numbered aisles in walking order, then store sections in walking order, then other named areas A to Z, then items with no aisle.
function compareAisles(a: string, b: string): number {
  const rank = (x: string) => (x === "" ? 2 : /^\d+$/.test(x) ? 0 : 1);
  if (rank(a) !== rank(b)) return rank(a) - rank(b);
  if (rank(a) === 0) return Number(a) - Number(b);
  return sectionRank(a) - sectionRank(b) || a.localeCompare(b, undefined, { sensitivity: "base" });
}

// Every open item by aisle, "later" ones included (clients choose whether to show them); done items are listed apart.
export function groupItems(items: ShoppingItem[]): ShoppingList {
  const open = items.filter((i) => !i.done);
  const aisles = [...new Set(open.map((i) => i.aisle))].sort(compareAisles);
  const byName = (a: ShoppingItem, b: ShoppingItem) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  const groups = aisles.map((aisle) => ({ title: aisleTitle(aisle), items: open.filter((i) => i.aisle === aisle).sort(byName) }));
  return { groups, done: items.filter((i) => i.done) };
}

// Checks a change that came from outside (a form or the API). Returns the cleaned change, or what was wrong with it.
export function parseChange(input: unknown, { needsName }: { needsName: boolean }): ItemChange | { error: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { error: "Send a JSON object." };
  const body = input as Record<string, unknown>;
  const change: ItemChange = {};
  for (const field of TEXT_FIELDS) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== "string") return { error: `${field} must be text.` };
    const text = body[field].trim();
    if (text.length > MAX_TEXT) return { error: `${field} is longer than ${MAX_TEXT} characters.` };
    change[field] = field === "aisle" ? cleanAisle(text) : text;
  }
  for (const field of FLAG_FIELDS) {
    if (body[field] === undefined) continue;
    if (typeof body[field] !== "boolean") return { error: `${field} must be true or false.` };
    change[field] = body[field];
  }
  if (body.meals !== undefined) {
    const meals = body.meals;
    if (!Array.isArray(meals) || meals.some((m) => typeof m !== "string")) return { error: "meals must be a list of names." };
    const names = [...new Set((meals as string[]).map((m) => m.trim()).filter(Boolean))];
    if (names.length > MAX_MEALS) return { error: `An item can be for at most ${MAX_MEALS} meals.` };
    if (names.some((m) => m.length > MAX_TEXT)) return { error: `A meal name is longer than ${MAX_TEXT} characters.` };
    change.meals = names;
  }
  if (change.name === "" || (needsName && change.name === undefined)) return { error: "An item needs a name." };
  if (Object.keys(change).length === 0) return { error: "Nothing to change. Send name, qty, aisle, note, meals, later or done." };
  return change;
}

export function listItems(): ShoppingItem[] {
  // Done items newest first, so the last thing checked off is the easiest to undo.
  const rows = getDb().prepare(`SELECT ${COLUMNS} FROM shopping_items WHERE cleared = 0 ORDER BY done_at DESC, id`).all() as unknown as Row[];
  return rows.map(toItem);
}

export function getItem(id: number): ShoppingItem | undefined {
  const row = getDb().prepare(`SELECT ${COLUMNS} FROM shopping_items WHERE id = ?`).get(id) as unknown as Row | undefined;
  return row && toItem(row);
}

// The aisle this item was in the last time it was on the list, so it only has to be typed once.
function rememberedAisle(name: string): string {
  const row = getDb().prepare("SELECT aisle FROM shopping_items WHERE name = ? COLLATE NOCASE AND aisle != '' ORDER BY id DESC LIMIT 1").get(name) as { aisle: string } | undefined;
  return row?.aisle ?? "";
}

// Likewise the photo: the most recent item of the same name that has one.
function rememberedPhoto(name: string): { id: number; photo_type: string } | undefined {
  return getDb().prepare("SELECT id, photo_type FROM shopping_items WHERE name = ? COLLATE NOCASE AND photo_type != '' ORDER BY id DESC LIMIT 1").get(name) as { id: number; photo_type: string } | undefined;
}

const photoPath = (id: number) => join(PHOTOS_DIR, String(id));

// The aisle comes from what was typed, else the last time this item was on the list, else a guess from its name.
// With lookUp, a guessed item is marked as being looked up; the caller starts the lookup (lib/aisles.ts).
export function addItem(change: ItemChange & { name: string }, { lookUp = false } = {}): ShoppingItem {
  const remembered = change.aisle ? "" : rememberedAisle(change.name);
  const [aisle, from] = change.aisle ? [change.aisle, "you"] : remembered ? [remembered, "remembered"] : [guessSection(change.name), "guess"];
  const photo = rememberedPhoto(change.name);
  const result = getDb().prepare("INSERT INTO shopping_items (name, qty, aisle, later, note, done_at, aisle_from, lookup, meals) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .run(change.name, change.qty ?? "", aisle, change.later ? 1 : 0, change.note ?? "", change.done ? new Date().toISOString() : null,
      from, lookUp && from === "guess" ? 1 : 0, JSON.stringify(change.meals ?? []));
  const id = Number(result.lastInsertRowid);
  if (photo && existsSync(photoPath(photo.id))) {
    copyFileSync(photoPath(photo.id), photoPath(id));
    getDb().prepare("UPDATE shopping_items SET photo_type = ?, photo_at = ? WHERE id = ?").run(photo.photo_type, new Date().toISOString(), id);
  }
  return getItem(id)!;
}

export function updateItem(id: number, change: ItemChange): ShoppingItem | undefined {
  const before = getItem(id);
  if (!before) return undefined;
  const after = { ...before, ...change };
  // Keep the time it was first checked off, so re-sending "done" doesn't move it up the done list.
  const doneAt = after.done ? (before.done ? undefined : new Date().toISOString()) : null;
  const db = getDb();
  db.prepare("UPDATE shopping_items SET name = ?, qty = ?, aisle = ?, later = ?, note = ?, meals = ? WHERE id = ?")
    .run(after.name, after.qty, after.aisle, after.later ? 1 : 0, after.note, JSON.stringify(after.meals), id);
  // An aisle set by hand wins over any lookup still running.
  if (change.aisle !== undefined && change.aisle !== before.aisle) db.prepare("UPDATE shopping_items SET aisle_from = 'you', lookup = 0 WHERE id = ?").run(id);
  if (doneAt !== undefined) db.prepare("UPDATE shopping_items SET done_at = ? WHERE id = ?").run(doneAt, id);
  return getItem(id);
}

export function removeItem(id: number): boolean {
  rmSync(photoPath(id), { force: true });
  return getDb().prepare("DELETE FROM shopping_items WHERE id = ?").run(id).changes > 0;
}

// Saves a photo for an item, replacing any it had. Returns the item, or what was wrong with the upload.
export function setPhoto(id: number, bytes: Uint8Array): ShoppingItem | { error: string } | undefined {
  if (!getItem(id)) return undefined;
  if (bytes.length === 0) return { error: "Send the photo as the request body." };
  if (bytes.length > MAX_PHOTO_BYTES) return { error: `The photo is over ${MAX_PHOTO_BYTES / 1024 / 1024} MB.` };
  const type = IMAGE_SIGNATURES.find((s) => s.matches(bytes))?.type;
  if (!type) return { error: "Send a JPEG, PNG, WebP or GIF image." };
  mkdirSync(PHOTOS_DIR, { recursive: true });
  writeFileSync(photoPath(id), bytes);
  getDb().prepare("UPDATE shopping_items SET photo_type = ?, photo_at = ? WHERE id = ?").run(type, new Date().toISOString(), id);
  return getItem(id);
}

export function getPhoto(id: number): { bytes: Buffer; type: string } | undefined {
  const row = getDb().prepare("SELECT photo_type FROM shopping_items WHERE id = ?").get(id) as { photo_type: string } | undefined;
  if (!row?.photo_type || !existsSync(photoPath(id))) return undefined;
  return { bytes: readFileSync(photoPath(id)), type: row.photo_type };
}

export function removePhoto(id: number): ShoppingItem | undefined {
  if (!getItem(id)) return undefined;
  rmSync(photoPath(id), { force: true });
  getDb().prepare("UPDATE shopping_items SET photo_type = '', photo_at = ? WHERE id = ?").run(new Date().toISOString(), id);
  return getItem(id);
}

// Cleared items are kept, hidden, so their aisle is remembered the next time the same thing is added.
export function clearDone(): void {
  getDb().prepare("UPDATE shopping_items SET cleared = 1 WHERE done_at IS NOT NULL").run();
}

// Items whose aisle is only a guess from their name: the ones a store lookup can improve.
export function guessedItems(): ShoppingItem[] {
  return listItems().filter((i) => !i.done && (i.aisleFrom === "guess" || i.aisleFrom === ""));
}

export function markLookingUp(id: number): void {
  getDb().prepare("UPDATE shopping_items SET lookup = 1 WHERE id = ?").run(id);
}

// The end of a lookup: the store's aisle when one was found, unless someone set the aisle by hand meanwhile.
export function finishLookup(id: number, aisle: string | undefined): ShoppingItem | undefined {
  const db = getDb();
  if (aisle) db.prepare("UPDATE shopping_items SET aisle = ?, aisle_from = 'store' WHERE id = ? AND lookup = 1").run(cleanAisle(aisle), id);
  db.prepare("UPDATE shopping_items SET lookup = 0 WHERE id = ?").run(id);
  return getItem(id);
}
