// The shopping list: things to buy, grouped by the store aisle they're in. Each item can say what it's for (meals,
// an occasion, any reason), and a reason can be switched off to hide its items from this trip.
// Checked-off items stay until they're cleared, so a mistaken tap can be undone.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getDb, PHOTOS_DIR } from "./db.ts";
import { recipesUsing } from "./recipes.ts";
import { guessSection, sectionRank } from "./sections.ts";
import { getAisleContents } from "./store-map.ts";

// photo is a version token (when the photo was set), or "" when there is none; the image is at /api/shopping/<id>/photo.
// aisleFrom: where the aisle came from ('you', 'remembered', 'store' when looked up, 'guess' from the name, or '').
// looking: the store's aisle is being looked up right now. meals: what it's bought for (meals, recipes or any other reason).
export type ShoppingItem = {
  id: number; name: string; qty: string; aisle: string; done: boolean; note: string; photo: string;
  aisleFrom: string; looking: boolean; meals: string[];
};
// holds: what the aisle holds, when known ("" otherwise).
export type ShoppingGroup = { title: string; holds: string; items: ShoppingItem[] };
// reasons: every reason an item can be given, the ones on the list first. hidden: the reasons switched off for this
// trip (NO_REASON stands for items with no reason).
export type ShoppingList = { groups: ShoppingGroup[]; done: ShoppingItem[]; reasons: string[]; hidden: string[] };
export type ItemChange = Partial<Omit<ShoppingItem, "id" | "photo" | "aisleFrom" | "looking">>;

export const NO_AISLE = "No aisle yet";
export const INBOX = "Inbox";
export const NO_REASON = "";
const MAX_REASONS = 40;
const MAX_MEALS = 10;
const TEXT_FIELDS = ["name", "qty", "aisle", "note"] as const;
const FLAG_FIELDS = ["done"] as const;
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
  id: number; name: string; qty: string; aisle: string; note: string; done_at: string | null; photo_type: string; photo_at: string;
  aisle_from: string; lookup: number; meals: string;
};
const toItem = (r: Row): ShoppingItem => ({
  id: r.id, name: r.name, qty: r.qty, aisle: r.aisle, done: r.done_at !== null, note: r.note,
  photo: r.photo_type ? r.photo_at : "", aisleFrom: r.aisle_from, looking: r.lookup === 1, meals: JSON.parse(r.meals) as string[],
});
const COLUMNS = "id, name, qty, aisle, note, done_at, photo_type, photo_at, aisle_from, lookup, meals";

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

// Every open item by aisle, hidden ones included (clients leave those out: see isShown); done items are listed apart.
// Items whose aisle is still being looked up wait in a first group, the Inbox, and move to their aisle when it ends.
export function groupItems(items: ShoppingItem[], contents: Record<string, string> = getAisleContents()): Pick<ShoppingList, "groups" | "done"> {
  const open = items.filter((i) => !i.done);
  const placed = open.filter((i) => !i.looking);
  const aisles = [...new Set(placed.map((i) => i.aisle))].sort(compareAisles);
  const byName = (a: ShoppingItem, b: ShoppingItem) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  const groups = aisles.map((aisle) => ({ title: aisleTitle(aisle), holds: contents[aisle] ?? "", items: placed.filter((i) => i.aisle === aisle).sort(byName) }));
  const inbox = open.filter((i) => i.looking).sort(byName);
  if (inbox.length > 0) groups.unshift({ title: INBOX, holds: "", items: inbox });
  return { groups, done: items.filter((i) => i.done) };
}

// An item is on this trip when one of its reasons is switched on; an item with no reason follows NO_REASON.
export function isShown(item: ShoppingItem, hidden: string[]): boolean {
  const off = new Set(hidden.map((h) => h.toLowerCase()));
  if (item.meals.length === 0) return !off.has(NO_REASON);
  return item.meals.some((m) => !off.has(m.toLowerCase()));
}

export function getHidden(): string[] {
  return (getDb().prepare("SELECT reason FROM shopping_hidden ORDER BY reason").all() as { reason: string }[]).map((r) => r.reason);
}

export function setHidden(reasons: string[]): void {
  const db = getDb();
  db.exec("BEGIN");
  db.exec("DELETE FROM shopping_hidden");
  for (const reason of reasons) db.prepare("INSERT OR IGNORE INTO shopping_hidden (reason) VALUES (?)").run(reason);
  db.exec("COMMIT");
}

// Checks {"hidden": [...]} from outside. Returns the cleaned names, or what was wrong.
export function parseHidden(input: unknown): string[] | { error: string } {
  const hidden = (input as { hidden?: unknown } | null)?.hidden;
  if (!Array.isArray(hidden) || hidden.some((h) => typeof h !== "string")) return { error: 'Send {"hidden": [...]}: the reasons to hide ("" for items with no reason).' };
  const names = [...new Set((hidden as string[]).map((h) => h.trim()))];
  if (names.some((h) => h.length > MAX_TEXT)) return { error: `A reason is longer than ${MAX_TEXT} characters.` };
  return names;
}

// The reasons to offer when picking: those on the list now (A to Z), then ones used before, most recent first.
export function listReasons(): string[] {
  const rows = getDb().prepare("SELECT meals, cleared, done_at FROM shopping_items WHERE meals != '[]' ORDER BY id DESC").all() as { meals: string; cleared: number; done_at: string | null }[];
  const seen = new Set<string>();
  const current: string[] = [], past: string[] = [];
  const take = (into: string[], row: { meals: string }) => {
    for (const m of JSON.parse(row.meals) as string[]) {
      if (seen.has(m.toLowerCase())) continue;
      seen.add(m.toLowerCase());
      into.push(m);
    }
  };
  for (const row of rows.filter((r) => !r.cleared && r.done_at === null)) take(current, row);
  for (const row of rows) take(past, row);
  current.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  return [...current, ...past].slice(0, Math.max(MAX_REASONS, current.length));
}

export function shoppingList(): ShoppingList {
  return { ...groupItems(listItems()), reasons: listReasons(), hidden: getHidden() };
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
    if (names.length > MAX_MEALS) return { error: `An item can have at most ${MAX_MEALS} reasons.` };
    if (names.some((m) => m.length > MAX_TEXT)) return { error: `A reason is longer than ${MAX_TEXT} characters.` };
    change.meals = names;
  }
  if (change.name === "" || (needsName && change.name === undefined)) return { error: "An item needs a name." };
  if (Object.keys(change).length === 0) return { error: "Nothing to change. Send name, qty, aisle, note, meals or done." };
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
// Added with no reason, it's for the typical recipes that use it, when there are any (lib/recipes.ts).
export function addItem(change: ItemChange & { name: string }, { lookUp = false } = {}): ShoppingItem {
  const remembered = change.aisle ? "" : rememberedAisle(change.name);
  const [aisle, from] = change.aisle ? [change.aisle, "you"] : remembered ? [remembered, "remembered"] : [guessSection(change.name), "guess"];
  const photo = rememberedPhoto(change.name);
  const meals = change.meals?.length ? change.meals : recipesUsing(change.name);
  const result = getDb().prepare("INSERT INTO shopping_items (name, qty, aisle, note, done_at, aisle_from, lookup, meals) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
    .run(change.name, change.qty ?? "", aisle, change.note ?? "", change.done ? new Date().toISOString() : null,
      from, lookUp && from === "guess" ? 1 : 0, JSON.stringify(meals));
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
  db.prepare("UPDATE shopping_items SET name = ?, qty = ?, aisle = ?, note = ?, meals = ? WHERE id = ?")
    .run(after.name, after.qty, after.aisle, after.note, JSON.stringify(after.meals), id);
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
