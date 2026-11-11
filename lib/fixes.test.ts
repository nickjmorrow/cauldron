import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

// Own database file, so the real one is never touched.
const FILE = "data/test-fixes.db";
process.env.CAULDRON_DB = FILE;
const { getDb } = await import("./db.ts");
const { getDay, createVersion } = await import("./queries.ts");
const { removeMeal, planMeal, addFood } = await import("./adjustments.ts");
const { poolFor, goalsFor, createFixProposal, createMatchAllProposals, acceptProposal, dismissProposal, describeChanges, listPendingProposals, createFixAllProposals, buildModel, goalsWithData } = await import("./fixes.ts");
const { setTolerance } = await import("./tolerances.ts");
const { totalsForChoice } = await import("./queries.ts");

test.after(() => { for (const ext of ["", "-wal", "-shm"]) rmSync(FILE + ext, { force: true }); });

const db = getDb();
const food = (name: string, nutrients: Record<string, number>, serving = "1 serving", dairy = 0, status = "approved") =>
  Number(db.prepare("INSERT INTO ingredients (name, serving, status, contains_dairy, nutrients) VALUES (?, ?, ?, ?, ?)").run(name, serving, status, dairy, JSON.stringify(nutrients)).lastInsertRowid);
const meal = (name: string, ingredient: number) => {
  const id = Number(db.prepare("INSERT INTO meals (name, status) VALUES (?, 'approved')").run(name).lastInsertRowid);
  db.prepare("INSERT INTO meal_items (meal_id, ingredient_id, qty) VALUES (?, ?, 1)").run(id, ingredient);
  return id;
};
const shakeMix = food("Shake mix", { calories: 600, protein: 40, fiber: 10, sodium: 800 });
const chickenMix = food("Chicken mix", { calories: 700, protein: 55, fiber: 10, sodium: 1200 });
const beans = food("Beans", { calories: 100, protein: 6, fiber: 8, sodium: 5 }, "1 cup");
const cheese = food("Cheese", { calories: 110, protein: 7 }, "1 slice", 1);
const maybe = food("Maybe food", { calories: 50, fiber: 5 }, "1 piece", 0, "proposed");
const shake = meal("Shake", shakeMix), chicken = meal("Chicken bowl", chickenMix);

db.prepare("INSERT INTO days (name, position) VALUES ('Standard day', 1)").run();
const slot = (name: string, position: number) => Number(db.prepare("INSERT INTO day_slots (day_id, name, position) VALUES (1, ?, ?)").run(name, position).lastInsertRowid);
const breakfast = slot("Breakfast", 1), dinner = slot("Dinner", 2);
const shakeOpt = Number(db.prepare("INSERT INTO slot_options (slot_id, meal_id, is_planned, part) VALUES (?, ?, 1, 0)").run(breakfast, shake).lastInsertRowid);
Number(db.prepare("INSERT INTO slot_options (slot_id, meal_id, is_planned, part) VALUES (?, ?, 1, 0)").run(dinner, chicken).lastInsertRowid);
db.prepare("INSERT INTO liked_foods (ingredient_id, slot_name, status) VALUES (?, 'Dinner', 'approved'), (?, 'Dinner', 'approved'), (?, 'Breakfast', 'approved'), (?, 'Breakfast', 'proposed')").run(beans, cheese, maybe, beans);
db.prepare("INSERT INTO targets (nutrient, workout, rest, daily, type) VALUES ('fiber', NULL, NULL, 28, 'at_least'), ('sodium', NULL, NULL, 2300, 'no_more_than')").run();
db.prepare("INSERT INTO goal_targets (goal, nutrient, workout, rest) VALUES ('maintain', 'calories', 2000, 1500), ('maintain', 'protein', 100, 80)").run();
db.prepare("INSERT INTO profile (id, age, sex, height_cm, weight_kg, workout_days) VALUES (1, 40, 'male', 175, 80, 4)").run();

const version = (kind: "workout" | "rest" = "rest", goal: "cut" | "maintain" | "bulk" = "maintain") => createVersion(1, kind, goal);
const dayNow = () => getDay(1)!;
const totalsFor = (v: number) => totalsForChoice({ slots: dayNow().versions.find((x) => x.id === v)!.slots });

test("the pool is the foods you like for a slot plus what the base day already uses there, minus dairy and unapproved foods", () => {
  const pool = poolFor(dayNow());
  const at = (slotId: number) => pool.filter((p) => p.slotIds.includes(slotId)).map((p) => p.name).sort();
  assert.deepEqual(at(dinner), ["Beans", "Chicken mix"]);
  assert.deepEqual(at(breakfast), ["Shake mix"]); // the proposed "Maybe food" and the dairy cheese stay out
});

test("how much of a food may be added follows how much you already eat of it, or 3 servings for a liked food", () => {
  const pool = poolFor(dayNow());
  const cap = (name: string) => pool.find((p) => p.name === name)!.maxQty;
  assert.equal(cap("Chicken mix"), 2); // eaten at 1 serving in the base day
  assert.equal(cap("Beans"), 3); // liked, not in a meal
});

test("goals come from the targets for this goal and kind, with tolerances and ceilings applied", () => {
  const goals = Object.fromEntries(goalsFor({ goal: "maintain", kind: "rest" }, null).map((g) => [g.key, g]));
  assert.equal(goals.calories.target, 1500);
  assert.equal(goals.protein.target, 80);
  assert.equal(goals.protein.hardCeiling, 176); // 80 kg x 2.2
  assert.equal(goals.protein.okUpTo, undefined);
  assert.equal(goals.fiber.type, "at_least");
  assert.equal(goals.sodium.type, "no_more_than");
  assert.equal(goalsFor({ goal: "maintain", kind: "workout" }, null).find((g) => g.key === "calories")!.target, 2000);

  assert.equal(setTolerance("protein", true, null), null);
  const tolerated = goalsFor({ goal: "maintain", kind: "rest" }, null).find((g) => g.key === "protein")!;
  assert.equal(tolerated.okUpTo, 176);
});

test("focusing on one nutrient makes it count for more", () => {
  const plain = goalsFor({ goal: "maintain", kind: "rest" }, null).find((g) => g.key === "fiber")!;
  const focused = goalsFor({ goal: "maintain", kind: "rest" }, ["fiber"]).find((g) => g.key === "fiber")!;
  assert.ok(focused.weight > plain.weight);
});

test("a fix proposal waits for review, then changes the version only when accepted", () => {
  db.prepare("DELETE FROM tolerances").run();
  const v = version();
  const before = totalsFor(v);
  const id = createFixProposal(v, ["fiber"])!;
  assert.ok(id > 0);
  const row = db.prepare("SELECT status, kind FROM proposals WHERE id = ?").get(id) as { status: string; kind: string };
  assert.deepEqual({ ...row }, { status: "pending", kind: "fix" });
  assert.equal(totalsFor(v).fiber, before.fiber, "nothing changes until accepted");

  assert.equal(acceptProposal(id), null);
  assert.ok(totalsFor(v).fiber! >= 28 * 0.97, `fiber ${totalsFor(v).fiber}`);
  assert.equal((db.prepare("SELECT status FROM proposals WHERE id = ?").get(id) as { status: string }).status, "accepted");
  const stored = JSON.parse((db.prepare("SELECT totals_after FROM proposals WHERE id = ?").get(id) as { totals_after: string }).totals_after);
  assert.ok(Math.abs(stored.fiber - totalsFor(v).fiber!) < 1e-9, "what was shown is what you got");
});

test("asking again once everything is as good as it gets proposes nothing", () => {
  const v = version("rest", "maintain");
  let guard = 0;
  for (let id = createFixProposal(v, null); id && guard < 5; id = createFixProposal(v, null), guard++) acceptProposal(id);
  assert.equal(createFixProposal(v, null), null);
});

test("dismissing a proposal changes nothing", () => {
  const v = version("workout", "maintain");
  const id = createFixProposal(v, ["fiber"])!;
  const adjustmentsBefore = (db.prepare("SELECT COUNT(*) AS n FROM version_adjustments WHERE version_id = ?").get(v) as { n: number }).n;
  dismissProposal(id);
  assert.equal((db.prepare("SELECT status FROM proposals WHERE id = ?").get(id) as { status: string }).status, "dismissed");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM version_adjustments WHERE version_id = ?").get(v) as { n: number }).n, adjustmentsBefore);
});

test("changes are described in words", () => {
  const day = dayNow();
  const lines = describeChanges(day.slots, [], [
    { id: -1, kind: "add", slotId: breakfast, mealId: null, ingredientId: beans, qty: 1.5 },
    { id: -2, kind: "scale", optionId: shakeOpt, factor: 0.75 },
    { id: -3, kind: "remove", optionId: shakeOpt + 1 },
  ], new Map([[beans, { name: "Beans", serving: "1 cup" }]]));
  assert.deepEqual(lines, ["Add 1.5 × Beans (1 cup) to Breakfast", "Shrink Shake to ¾ portion", "Drop Chicken bowl"]);
});

test("pending proposals come with plain-words changes and before and after progress", () => {
  const v = version("workout", "maintain");
  const id = createFixProposal(v, ["fiber"])!;
  const view = listPendingProposals().find((p) => p.id === id)!;
  assert.equal(view.versionLabel, "Maintain · Workout");
  assert.match(view.versionHref, /goal=maintain&kind=workout/);
  assert.ok(view.changes.length > 0 && view.changes.every((c) => typeof c === "string"));
  const fiber = view.rows.find((r) => r.label === "Fiber")!;
  assert.ok(fiber.after > fiber.before, "fiber should rise");
  assert.ok(view.rows.some((r) => r.label === "Calories"), "calories always show");
  dismissProposal(id);
  assert.equal(listPendingProposals().some((p) => p.id === id), false);
});

test("improving all six versions files one suggestion for each that can be improved", () => {
  db.prepare("DELETE FROM proposals").run();
  const ids = createFixAllProposals();
  assert.ok(ids.length >= 1 && ids.length <= 6, `${ids.length} proposals`);
  const rows = db.prepare("SELECT DISTINCT version_id, kind, status FROM proposals").all() as { version_id: number; kind: string; status: string }[];
  assert.equal(new Set(rows.map((r) => r.version_id)).size, ids.length, "at most one suggestion per version");
  assert.ok(rows.every((r) => r.kind === "fix" && r.status === "pending"));
  db.prepare("DELETE FROM proposals").run();
});

test("a suggestion is refused once the version has been changed by hand since it was made", () => {
  db.prepare("DELETE FROM proposals").run();
  const v = version("workout", "maintain");
  const id = createFixProposal(v, ["fiber"])!;
  removeMeal(v, shakeOpt); // the person edits the version after the suggestion was made
  const before = (db.prepare("SELECT COUNT(*) AS n FROM version_adjustments WHERE version_id = ?").get(v) as { n: number }).n;
  assert.match(acceptProposal(id)!, /changed since/);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM version_adjustments WHERE version_id = ?").get(v) as { n: number }).n, before);
  assert.equal((db.prepare("SELECT status FROM proposals WHERE id = ?").get(id) as { status: string }).status, "pending");
  db.prepare("DELETE FROM version_adjustments WHERE version_id = ?").run(v);
  db.prepare("DELETE FROM proposals").run();
});

test("a refit from another version says what it takes away: restored meals and planned choices", () => {
  db.prepare("DELETE FROM proposals").run();
  db.prepare("DELETE FROM version_adjustments").run();
  const salmonOpt = Number(db.prepare("INSERT INTO slot_options (slot_id, meal_id, is_planned, part) VALUES (?, ?, 0, 0)").run(dinner, meal("Salmon bowl", food("Salmon mix", { calories: 600, protein: 38, fiber: 9, sodium: 900 }))).lastInsertRowid);
  const target = version("rest", "maintain");
  removeMeal(target, shakeOpt); // this version drops the shake...
  planMeal(target, salmonOpt); // ...and plans salmon for dinner
  const source = version("workout", "bulk"); // the source has neither
  createMatchAllProposals(source);
  const view = listPendingProposals().find((p) => p.versionLabel === "Maintain · Rest")!;
  assert.ok(view.changes.some((c) => /Bring back Shake/.test(c)), view.changes.join(" | "));
  assert.ok(view.changes.some((c) => /Stop planning Salmon bowl/.test(c)), view.changes.join(" | "));
  db.prepare("DELETE FROM proposals").run();
  db.prepare("DELETE FROM version_adjustments").run();
  db.prepare("DELETE FROM slot_options WHERE id = ?").run(salmonOpt);
});

test("dairy added by hand never becomes part of a suggestion, though its nutrients still count", () => {
  db.prepare("DELETE FROM proposals").run();
  db.prepare("DELETE FROM version_adjustments").run();
  const source = version("workout", "bulk");
  addFood(source, breakfast, { ingredientId: cheese }, 1);
  const day = dayNow();
  assert.ok(!poolFor(day).some((p) => p.ingredientId === cheese), "cheese must not be offered");
  assert.equal(buildModel(day).ingredientNutrients![cheese].calories, 110, "but its calories still count");
  createMatchAllProposals(source);
  const stored = (db.prepare("SELECT adjustments FROM proposals").all() as { adjustments: string }[]).flatMap((r) => JSON.parse(r.adjustments) as { kind: string; ingredientId?: number }[]);
  assert.ok(!stored.some((a) => a.kind === "add" && a.ingredientId === cheese), "no suggestion contains cheese");
  db.prepare("DELETE FROM proposals").run();
  db.prepare("DELETE FROM version_adjustments").run();
});

test("a target no food has any data for is not chased", () => {
  db.prepare("INSERT OR REPLACE INTO targets (nutrient, workout, rest, daily, type) VALUES ('vit_d', NULL, NULL, 800, 'at_least')").run();
  const day = dayNow();
  const keys = goalsWithData(buildModel(day), goalsFor({ goal: "maintain", kind: "rest" }, null)).map((g) => g.key);
  assert.ok(keys.includes("fiber") && keys.includes("calories"));
  assert.ok(!keys.includes("vit_d"), "no food carries vitamin D, so it would look like a shortfall everywhere");
  db.prepare("DELETE FROM targets WHERE nutrient = 'vit_d'").run();
});

test("accepting a proposal for a day that has since changed is refused and leaves everything as it was", () => {
  const v = version("workout", "bulk");
  const id = createFixProposal(v, ["fiber"])!;
  db.prepare("DELETE FROM slot_options WHERE slot_id = ?").run(dinner); // the dinner meals vanish; the proposal adds beans to that slot's meals' day
  db.prepare("DELETE FROM day_slots WHERE id = ?").run(dinner); // and the slot itself
  const before = (db.prepare("SELECT COUNT(*) AS n FROM version_adjustments WHERE version_id = ?").get(v) as { n: number }).n;
  assert.match(acceptProposal(id)!, /changed/);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM version_adjustments WHERE version_id = ?").get(v) as { n: number }).n, before);
  assert.equal((db.prepare("SELECT status FROM proposals WHERE id = ?").get(id) as { status: string }).status, "pending");
});

test("matching all versions to one starts every other version from that one's changes", () => {
  const source = version("rest", "cut");
  removeMeal(source, shakeOpt); // the source drops the breakfast shake
  const ids = createMatchAllProposals(source);
  const rows = db.prepare("SELECT id, version_id, kind, adjustments FROM proposals WHERE id IN (" + ids.join(",") + ")").all() as { id: number; version_id: number; kind: string; adjustments: string }[];
  assert.equal(rows.length, 5);
  assert.ok(rows.every((r) => r.kind === "generate" && r.version_id !== source));
  assert.equal(new Set(rows.map((r) => r.version_id)).size, 5);
  assert.ok(rows.every((r) => (JSON.parse(r.adjustments) as { kind: string; optionId?: number }[]).some((a) => a.kind === "remove" && a.optionId === shakeOpt)), "the source's drop carries over");
});
