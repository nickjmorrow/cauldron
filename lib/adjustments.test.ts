import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

// Own database file, so the real one is never touched.
const FILE = "data/test-adjustments.db";
process.env.CAULDRON_DB = FILE;
const { getDb } = await import("./db.ts");
const { createVersion } = await import("./queries.ts");
const { removeMeal, restoreMeal, scaleMeal, planMeal, addFood, setAddedQty, removeAdjustment, resetVersion } = await import("./adjustments.ts");

test.after(() => { for (const ext of ["", "-wal", "-shm"]) rmSync(FILE + ext, { force: true }); });

const db = getDb();
const rows = (v: number) => db.prepare("SELECT kind, option_id, slot_id, meal_id, ingredient_id, qty, factor FROM version_adjustments WHERE version_id = ? ORDER BY id").all(v).map((r) => ({ ...r })) as Record<string, number | null>[];
const food = (name: string) => Number(db.prepare("INSERT INTO ingredients (name, serving, status, nutrients) VALUES (?, '100 g', 'approved', '{}')").run(name).lastInsertRowid);
const meal = (name: string) => Number(db.prepare("INSERT INTO meals (name, status) VALUES (?, 'approved')").run(name).lastInsertRowid);
const day = (name: string) => Number(db.prepare("INSERT INTO days (name) VALUES (?)").run(name).lastInsertRowid);
const slot = (d: number, name: string) => Number(db.prepare("INSERT INTO day_slots (day_id, name, position) VALUES (?, ?, 1)").run(d, name).lastInsertRowid);
const option = (s: number, m: number, planned: number, part = 0) => Number(db.prepare("INSERT INTO slot_options (slot_id, meal_id, is_planned, part) VALUES (?, ?, ?, ?)").run(s, m, planned, part).lastInsertRowid);

const shake = meal("Shake"), chicken = meal("Chicken"), salmon = meal("Salmon"), turkey = meal("Turkey");
const banana = food("Banana"), egg = food("Egg");
const mine = day("Mine"), other = day("Other");
const breakfast = slot(mine, "Breakfast"), dinner = slot(mine, "Dinner");
const shakeOpt = option(breakfast, shake, 1);
const chickenOpt = option(dinner, chicken, 1), salmonOpt = option(dinner, salmon, 0), turkeyOpt = option(dinner, turkey, 0);
const foreignOpt = option(slot(other, "Dinner"), chicken, 1);
const version = () => createVersion(mine, "workout", "bulk", {}); // same version each call

test("removing a meal and restoring it", () => {
  const v = version();
  removeMeal(v, shakeOpt);
  removeMeal(v, shakeOpt); // twice is fine
  assert.deepEqual(rows(v).map((r) => [r.kind, r.option_id]), [["remove", shakeOpt]]);
  restoreMeal(v, shakeOpt);
  assert.deepEqual(rows(v), []);
});

test("removing a meal drops any scale or plan on it", () => {
  const v = version();
  scaleMeal(v, salmonOpt, 0.75);
  planMeal(v, salmonOpt);
  removeMeal(v, salmonOpt);
  assert.deepEqual(rows(v).map((r) => [r.kind, r.option_id]), [["remove", salmonOpt]]);
  resetVersion(v);
});

test("scaling keeps one row per meal, 1 clears it, and a removed meal comes back", () => {
  const v = version();
  scaleMeal(v, shakeOpt, 0.75);
  scaleMeal(v, shakeOpt, 0.5);
  assert.deepEqual(rows(v).map((r) => [r.kind, r.factor]), [["scale", 0.5]]);
  scaleMeal(v, shakeOpt, 1);
  assert.deepEqual(rows(v), []);
  removeMeal(v, shakeOpt);
  scaleMeal(v, shakeOpt, 0.75);
  assert.deepEqual(rows(v).map((r) => r.kind), ["scale"]);
  resetVersion(v);
});

test("a portion outside half to one and a half times is refused", () => {
  const v = version();
  for (const bad of [0.4, 1.6, 0, -1, Number.NaN]) assert.throws(() => scaleMeal(v, shakeOpt, bad), /between/);
  assert.deepEqual(rows(v), []);
});

test("planning a variation replaces the previous plan in that part, and the base's own choice needs no row", () => {
  const v = version();
  planMeal(v, salmonOpt);
  planMeal(v, turkeyOpt);
  assert.deepEqual(rows(v).map((r) => [r.kind, r.option_id]), [["plan", turkeyOpt]]);
  planMeal(v, chickenOpt); // the base already plans chicken
  assert.deepEqual(rows(v), []);
});

test("adding a food: validated, merged when repeated, and kept to this day's slots", () => {
  const v = version();
  addFood(v, dinner, { ingredientId: banana }, 1);
  addFood(v, dinner, { ingredientId: banana }, 0.5);
  addFood(v, breakfast, { mealId: shake }, 1);
  assert.deepEqual(rows(v).map((r) => [r.kind, r.slot_id, r.ingredient_id, r.meal_id, r.qty]), [
    ["add", dinner, banana, null, 1.5], ["add", breakfast, null, shake, 1],
  ]);
  assert.throws(() => addFood(v, dinner, {}, 1), /exactly one/);
  assert.throws(() => addFood(v, dinner, { ingredientId: banana, mealId: shake }, 1), /exactly one/);
  for (const bad of [0, -1, 21, Number.NaN]) assert.throws(() => addFood(v, dinner, { ingredientId: egg }, bad), /quantity/);
  assert.throws(() => addFood(v, 999999, { ingredientId: egg }, 1), /slot/);
  assert.equal(rows(v).length, 2);
  resetVersion(v);
});

test("options and slots from another day are refused", () => {
  const v = version();
  assert.throws(() => removeMeal(v, foreignOpt), /not part of this day/);
  assert.throws(() => scaleMeal(v, foreignOpt, 0.75), /not part of this day/);
  assert.throws(() => planMeal(v, foreignOpt), /not part of this day/);
  assert.deepEqual(rows(v), []);
});

test("an added amount can be changed, and zero removes it", () => {
  const v = version();
  addFood(v, dinner, { ingredientId: egg }, 1);
  const id = rows(v).length && Number((db.prepare("SELECT id FROM version_adjustments WHERE version_id = ? AND kind = 'add'").get(v) as { id: number }).id);
  setAddedQty(id, 3);
  assert.equal(rows(v)[0].qty, 3);
  assert.throws(() => setAddedQty(id, -1), /quantity/);
  setAddedQty(id, 0);
  assert.deepEqual(rows(v), []);
});

test("removing one adjustment and resetting a version", () => {
  const v = version();
  removeMeal(v, shakeOpt);
  addFood(v, dinner, { ingredientId: egg }, 1);
  const first = (db.prepare("SELECT id FROM version_adjustments WHERE version_id = ? ORDER BY id").get(v) as { id: number }).id;
  removeAdjustment(first);
  assert.deepEqual(rows(v).map((r) => r.kind), ["add"]);
  resetVersion(v);
  assert.deepEqual(rows(v), []);
});
