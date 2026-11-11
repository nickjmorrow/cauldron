import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

// Own database file, so the real one is never touched.
const FILE = "data/test-parts.db";
process.env.CAULDRON_DB = FILE;
const { getDb } = await import("./db.ts");
const { getDay, totalsForChoice, variantCombos, partKey, describeSlot } = await import("./queries.ts");

test.after(() => { for (const ext of ["", "-wal", "-shm"]) rmSync(FILE + ext, { force: true }); });

function seed() {
  const db = getDb();
  const food = (name: string, kcal: number) => Number(db.prepare(
    "INSERT INTO ingredients (name, serving, status, nutrients) VALUES (?, '1 meal', 'approved', ?)",
  ).run(name, JSON.stringify({ calories: kcal })).lastInsertRowid);
  const meal = (name: string, kcal: number) => {
    const id = Number(db.prepare("INSERT INTO meals (name, status) VALUES (?, 'approved')").run(name).lastInsertRowid);
    db.prepare("INSERT INTO meal_items (meal_id, ingredient_id, qty) VALUES (?, ?, 1)").run(id, food(name, kcal));
    return id;
  };
  const shake = meal("Shake", 600), greens = meal("Greens", 50), chicken = meal("Chicken", 500), salmon = meal("Salmon", 560);
  const day = Number(db.prepare("INSERT INTO days (name) VALUES ('Test day')").run().lastInsertRowid);
  const slot = (name: string, position: number) => Number(db.prepare("INSERT INTO day_slots (day_id, name, position) VALUES (?, ?, ?)").run(day, name, position).lastInsertRowid);
  const option = (slotId: number, mealId: number, planned: number, part: number) =>
    db.prepare("INSERT INTO slot_options (slot_id, meal_id, is_planned, part) VALUES (?, ?, ?, ?)").run(slotId, mealId, planned, part);
  const breakfast = slot("Breakfast", 1), dinner = slot("Dinner", 2);
  option(breakfast, shake, 1, 0); option(breakfast, greens, 1, 1);   // eaten together
  option(dinner, chicken, 1, 0); option(dinner, salmon, 0, 0);       // variations
  return { day, breakfast, dinner, salmon: salmon };
}

test("things in one slot are added together, variations are not", () => {
  const { day } = seed();
  const d = getDay(day)!;
  assert.equal(totalsForChoice(d).calories, 600 + 50 + 500);
  assert.equal(describeSlot(d.slots[0]), "Shake + Greens");
  assert.equal(describeSlot(d.slots[1]), "Chicken / Salmon");
});

test("only parts with variations make comparison columns", () => {
  const d = getDay(Number(getDb().prepare("SELECT id FROM days WHERE name = 'Test day'").get()!.id))!;
  const combos = variantCombos(d);
  assert.equal(combos.length, 2);
  const dinner = d.slots[1];
  const salmon = dinner.parts[0].options[1].optionId;
  const withSalmon = combos.find((c) => c[partKey(dinner.id, 0)] === salmon)!;
  assert.equal(totalsForChoice(d, withSalmon).calories, 600 + 50 + 560);
});
