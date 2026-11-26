import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

// Own database file, so the real one is never touched.
const FILE = "data/test-prep.db";
process.env.CAULDRON_DB = FILE;
const { getDb } = await import("./db.ts");
const { batchLasts, cadenceLabel, eatenPerWeek, listPrep, parsePrep, removePrep, savePrep, suggestEvery } = await import("./prep.ts");

test.after(() => { for (const ext of ["", "-wal", "-shm"]) rmSync(FILE + ext, { force: true }); });

const db = getDb();
const id = (sql: string, ...args: (string | number)[]) => Number(db.prepare(sql).run(...args).lastInsertRowid);
const day = id("INSERT INTO days (name, position) VALUES ('Standard day', 1)");
const lunch = id("INSERT INTO day_slots (day_id, name, position) VALUES (?, 'Lunch', 1)", day);
const dinner = id("INSERT INTO day_slots (day_id, name, position) VALUES (?, 'Dinner', 2)", day);
const ingredient = (name: string, calories: number) => id("INSERT INTO ingredients (name, serving, status, nutrients) VALUES (?, '100 g', 'approved', ?)", name, JSON.stringify({ calories }));
const meal = (name: string, items: [number, number][]) => {
  const m = id("INSERT INTO meals (name, status) VALUES (?, 'approved')", name);
  for (const [ing, qty] of items) db.prepare("INSERT INTO meal_items (meal_id, ingredient_id, qty) VALUES (?, ?, ?)").run(m, ing, qty);
  return m;
};
const option = (slot: number, m: number, part: number) => db.prepare("INSERT INTO slot_options (slot_id, meal_id, part) VALUES (?, ?, ?)").run(slot, m, part);

const chicken = ingredient("Chicken", 200), oil = ingredient("Oil", 900), bread = ingredient("Bread", 250), rice = ingredient("Rice", 130);
// Dinner: roast chicken or fish (one of 2), with rice every night. Lunch: a wrap or a salad (one of 2).
const roast = meal("Roast Chicken", [[chicken, 2], [oil, 0.02]]);
const fish = meal("Fish", []);
const riceMeal = meal("Rice", [[rice, 2]]);
const wrap = meal("Chicken Wrap", [[chicken, 1], [bread, 1], [oil, 0.02]]);
const salad = meal("Salad", []);
const soup = meal("Soup", []);
option(dinner, roast, 0); option(dinner, fish, 0); option(dinner, riceMeal, 1);
option(lunch, wrap, 0); option(lunch, salad, 0);
db.prepare("INSERT INTO meal_lines (meal_id, position, text) VALUES (?, 0, ?)").run(wrap, "100 g cooked chicken — see [[roast chicken]]");
db.prepare("INSERT INTO meal_lines (meal_id, position, text) VALUES (?, 1, ?)").run(wrap, "bread, and [[Rice]] if there is some");

test("a meal is eaten 7 times a week divided by its part's variations, plus what linked meals take from it", () => {
  const eaten = eatenPerWeek();
  assert.equal(eaten.get(riceMeal), 7); // the wrap links to rice but counts none of it
  assert.equal(eaten.get(fish), 3.5);
  assert.equal(eaten.get(wrap), 3.5);
  // 3.5 dinners, plus 3.5 wraps each taking half a serving (1 of chicken against the roast's 2; oil isn't the main ingredient).
  assert.equal(eaten.get(roast), 3.5 + 3.5 * 0.5);
  assert.equal(eaten.get(soup), undefined);
});

test("a batch is made when it runs out", () => {
  assert.equal(batchLasts(3, 5.25), 4);
  assert.equal(batchLasts(3, 0), null);
  assert.equal(suggestEvery(3, 5.25), 4);
  assert.equal(suggestEvery(2.9, 7), 2); // whole days, rounded down
  assert.equal(suggestEvery(0.5, 7), 1); // never more often than daily
  assert.equal(suggestEvery(3, 0), null); // not eaten
});

test("a week or more snaps down to 1, 2 or 4 weeks", () => {
  assert.equal(suggestEvery(6, 7), 6);
  assert.equal(suggestEvery(9, 7), 7);
  assert.equal(suggestEvery(20, 7), 14);
  assert.equal(suggestEvery(100, 7), 28);
});

test("cadences read as days or weeks", () => {
  assert.deepEqual([1, 3, 7, 10, 14, 28].map(cadenceLabel), ["Every day", "Every 3 days", "Every week", "Every 10 days", "Every 2 weeks", "Every 4 weeks"]);
});

test("what is wrong with a prep is said plainly", () => {
  const error = (input: unknown) => (parsePrep(input) as { error: string }).error;
  const good = { task: "Roast a tray", makes: 3, keepsDays: 4, everyDays: 4 };
  assert.deepEqual(parsePrep({ ...good, task: " Roast a tray " }), good);
  assert.deepEqual(parsePrep({ task: "Roast", makes: 3, everyDays: 4 }), { task: "Roast", makes: 3, keepsDays: 0, everyDays: 4 });
  assert.match(error(null), /JSON object/);
  assert.match(error({ ...good, task: " " }), /needs a task/);
  assert.match(error({ ...good, makes: 0 }), /makes must be a number of servings/);
  assert.match(error({ ...good, makes: "3" }), /makes must be a number of servings/);
  assert.match(error({ ...good, keepsDays: 1.5 }), /keepsDays must be a whole number/);
  assert.match(error({ ...good, everyDays: 0 }), /everyDays must be a whole number of days from 1/);
});

test("prep is saved per meal, listed most frequent first, and flags a cadence that doesn't fit", () => {
  savePrep(riceMeal, { task: "Cook a pot", makes: 4, keepsDays: 3, everyDays: 7 });
  savePrep(roast, { task: "Roast a tray", makes: 3, keepsDays: 4, everyDays: 3 });
  savePrep(soup, { task: "Make a pot", makes: 6, keepsDays: 0, everyDays: 14 });
  savePrep(roast, { task: "Roast a tray", makes: 3, keepsDays: 4, everyDays: 4 }); // replaces
  const list = listPrep();
  assert.deepEqual(list.map((p) => [p.name, p.everyDays]), [["Roast Chicken", 4], ["Rice", 7], ["Soup", 14]]);
  const [roastPrep, ricePrep, soupPrep] = list;
  assert.deepEqual([roastPrep.perWeek, roastPrep.lastsDays, roastPrep.suggestedDays, roastPrep.runsOut, roastPrep.outlastsKeeping], [5.25, 4, 4, false, false]);
  // 4 servings at one a day last 4 days but keep 3: weekly runs out, and the last day's serving is past its keeping.
  assert.deepEqual([ricePrep.lastsDays, ricePrep.suggestedDays, ricePrep.runsOut, ricePrep.outlastsKeeping], [4, 4, true, true]);
  assert.deepEqual([soupPrep.perWeek, soupPrep.lastsDays, soupPrep.suggestedDays, soupPrep.runsOut, soupPrep.outlastsKeeping], [0, null, null, false, false]);
  assert.throws(() => savePrep(9999, { task: "x", makes: 1, keepsDays: 0, everyDays: 1 }), /No meal with that id/);
  removePrep(soup);
  assert.equal(listPrep().length, 2);
});
