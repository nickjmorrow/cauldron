import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

// Own database file, so the real one is never touched.
const FILE = "data/test-day-versions.db";
process.env.CAULDRON_DB = FILE;
const { getDb } = await import("./db.ts");
const { getDay, createVersion, versionExists, dayIngredients, pendingCount, rejectVersion, totalsForChoice } = await import("./queries.ts");

test.after(() => { for (const ext of ["", "-wal", "-shm"]) rmSync(FILE + ext, { force: true }); });

const db = getDb();
const n = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
const food = (name: string, kcal: number, protein = 0) => Number(db.prepare("INSERT INTO ingredients (name, serving, status, nutrients) VALUES (?, '100 g', 'approved', ?)").run(name, JSON.stringify({ calories: kcal, protein })).lastInsertRowid);
const meal = (name: string, kcal: number, protein: number) => {
  const id = Number(db.prepare("INSERT INTO meals (name, status) VALUES (?, 'approved')").run(name).lastInsertRowid);
  db.prepare("INSERT INTO meal_items (meal_id, ingredient_id, qty) VALUES (?, ?, 1)").run(id, food(name, kcal, protein));
  return id;
};
const day = (name: string) => Number(db.prepare("INSERT INTO days (name) VALUES (?)").run(name).lastInsertRowid);
const slot = (dayId: number, name: string, position: number) => Number(db.prepare("INSERT INTO day_slots (day_id, name, position) VALUES (?, ?, ?)").run(dayId, name, position).lastInsertRowid);
const option = (slotId: number, mealId: number, planned: number, part: number) =>
  Number(db.prepare("INSERT INTO slot_options (slot_id, meal_id, is_planned, part) VALUES (?, ?, ?, ?)").run(slotId, mealId, planned, part).lastInsertRowid);
const adjust = (version: number, kind: string, cols: Record<string, number>) => {
  const keys = ["option_id", "slot_id", "meal_id", "ingredient_id", "qty", "factor"];
  return Number(db.prepare(`INSERT INTO version_adjustments (version_id, kind, ${keys.join(", ")}) VALUES (?, ?, ${keys.map(() => "?").join(", ")})`)
    .run(version, kind, ...keys.map((k) => cols[k] ?? null)).lastInsertRowid);
};

const shake = meal("Shake", 600, 40), greens = meal("Greens", 50, 3), chicken = meal("Chicken", 500, 50), salmon = meal("Salmon", 560, 38);
const banana = food("Banana", 100, 1), egg = food("Egg", 70, 6);

// A base day: breakfast (shake + greens together), dinner (chicken or salmon).
const standard = day("Standard day");
const breakfast = slot(standard, "Breakfast", 1), dinner = slot(standard, "Dinner", 2);
const shakeOption = option(breakfast, shake, 1, 0), greensOption = option(breakfast, greens, 1, 1);
option(dinner, chicken, 1, 0); option(dinner, salmon, 0, 0);

test("a day with no slots or versions loads with nothing in it", () => {
  const empty = day("Empty day");
  const loaded = getDay(empty)!;
  assert.deepEqual([loaded.slots, loaded.versions], [[], []]);
  assert.deepEqual(dayIngredients(loaded), []);
});

test("a version resolves to the base day with its adjustments applied, and the base is untouched", () => {
  const v = createVersion(standard, "workout", "bulk");
  adjust(v, "remove", { option_id: greensOption });
  adjust(v, "scale", { option_id: shakeOption, factor: 0.5 });
  adjust(v, "add", { slot_id: dinner, ingredient_id: banana, qty: 2 });
  const loaded = getDay(standard)!;
  const version = loaded.versions.find((x) => x.id === v)!;
  // shake 300 + chicken 500 (planned dinner) + 2 bananas 200
  assert.equal(totalsForChoice(version).calories, 1000);
  assert.equal(version.slots[0].parts.length, 1, "greens removed");
  assert.equal(totalsForChoice({ slots: loaded.slots }).calories, 600 + 50 + 500, "the base day keeps every meal at full size");
});

test("a version started from another copies its adjustments, not its slots", () => {
  const from = createVersion(standard, "rest", "cut");
  adjust(from, "remove", { option_id: greensOption });
  adjust(from, "add", { slot_id: dinner, ingredient_id: egg, qty: 1 });
  const slotsBefore = n("day_slots");
  const copy = createVersion(standard, "rest", "bulk", { copyFrom: from });
  assert.equal(n("day_slots"), slotsBefore);
  const rows = (v: number) => db.prepare("SELECT kind, option_id, slot_id, ingredient_id, qty FROM version_adjustments WHERE version_id = ? ORDER BY kind").all(v).map((r) => ({ ...r }));
  assert.deepEqual(rows(copy), rows(from));
  assert.equal(rows(copy).length, 2);
});

test("creating the same version twice returns the first one and adds nothing", () => {
  const first = createVersion(standard, "workout", "cut");
  adjust(first, "remove", { option_id: greensOption });
  const before = { versions: n("day_versions"), adjustments: n("version_adjustments") };
  assert.equal(createVersion(standard, "workout", "cut", { copyFrom: first }), first);
  assert.deepEqual({ versions: n("day_versions"), adjustments: n("version_adjustments") }, before);
});

test("versionExists follows the table", () => {
  const d = day("Exists day");
  assert.equal(versionExists(d, "rest", "cut"), false);
  const v = createVersion(d, "rest", "cut");
  assert.equal(versionExists(d, "rest", "cut"), true);
  db.prepare("DELETE FROM day_versions WHERE id = ?").run(v);
  assert.equal(versionExists(d, "rest", "cut"), false);
});

test("a day's ingredients cover the base meals and what approved versions add, but not proposed versions", () => {
  const d = day("Ingredients day");
  const s = slot(d, "Lunch", 1);
  option(s, chicken, 1, 0);
  const approved = createVersion(d, "rest", "maintain");
  const proposed = createVersion(d, "workout", "maintain", { status: "proposed" });
  adjust(approved, "add", { slot_id: s, ingredient_id: banana, qty: 1 });
  adjust(proposed, "add", { slot_id: s, ingredient_id: egg, qty: 1 });
  assert.deepEqual(dayIngredients(getDay(d)!).map((i) => i.name), ["Banana", "Chicken"]);
});

test("deleting the day takes its versions, slots, meals and adjustments with it", () => {
  const d = day("Doomed day");
  const s = slot(d, "Lunch", 1);
  const o = option(s, chicken, 1, 0);
  const v = createVersion(d, "rest", "maintain");
  adjust(v, "remove", { option_id: o });
  adjust(v, "add", { slot_id: s, ingredient_id: egg, qty: 1 });
  const before = { versions: n("day_versions"), slots: n("day_slots"), options: n("slot_options"), adjustments: n("version_adjustments") };
  db.prepare("DELETE FROM days WHERE id = ?").run(d);
  assert.deepEqual({ versions: n("day_versions"), slots: n("day_slots"), options: n("slot_options"), adjustments: n("version_adjustments") },
    { versions: before.versions - 1, slots: before.slots - 1, options: before.options - 1, adjustments: before.adjustments - 2 });
});

test("the pending count follows proposed versions", () => {
  const before = pendingCount();
  const d = day("Pending day");
  const v = createVersion(d, "rest", "maintain", { status: "proposed" });
  assert.equal(pendingCount(), before + 1);
  db.prepare("UPDATE day_versions SET status = 'approved' WHERE id = ?").run(v);
  assert.equal(pendingCount(), before);
});

test("rejecting a proposal removes just that version and keeps the day", () => {
  const d = day("Kept day");
  const v = createVersion(d, "workout", "bulk", { status: "proposed" });
  rejectVersion(v);
  assert.equal(versionExists(d, "workout", "bulk"), false);
  assert.ok(db.prepare("SELECT id FROM days WHERE id = ?").get(d));
});

test("rejecting never touches an approved version", () => {
  const d = day("Approved day");
  const v = createVersion(d, "rest", "cut");
  rejectVersion(v);
  assert.equal(versionExists(d, "rest", "cut"), true);
});
