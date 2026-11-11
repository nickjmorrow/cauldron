import test from "node:test";
import assert from "node:assert/strict";
import { blockHeight, ghostSlots } from "./ghost.ts";
import { resolveVersion, type Adjustment } from "./resolve.ts";
import type { Slot } from "./queries.ts";

// Hand-built base day: no database involved.
const meal = (id: number, name: string, calories: number) => ({ id, name, totals: { calories, protein: calories / 10 }, items: [] }) as never;
const opt = (optionId: number, id: number, name: string, calories: number, isPlanned = true) => ({ optionId, meal: meal(id, name, calories), isPlanned });
const base: Slot[] = [
  { id: 1, name: "Breakfast", parts: [{ part: 0, options: [opt(10, 1, "Shake", 600)] }, { part: 1, options: [opt(11, 2, "Greens", 50)] }] },
  { id: 2, name: "Dinner", parts: [{ part: 0, options: [opt(20, 3, "Chicken", 600), opt(21, 4, "Beef", 640, false)] }] },
];
const lookup = { meal: (id: number) => (id === 5 ? meal(5, "Rice", 200) : undefined), ingredient: () => undefined };
const ghost = (adjustments: Adjustment[]) => ghostSlots(base, resolveVersion(base, adjustments, lookup));

test("a version with no changes shows every base meal as it is", () => {
  const slots = ghost([]);
  const blocks = slots.flatMap((s) => s.parts.flatMap((p) => p.options));
  assert.equal(blocks.length, 4);
  for (const b of blocks) {
    assert.equal(b.status, "base");
    assert.equal(b.kcal, b.baseKcal);
    assert.equal(b.factor, 1);
  }
  assert.deepEqual(slots.map((s) => s.added.length), [0, 0]);
});

test("a resized meal keeps its base calories and shows the new ones", () => {
  const [breakfast] = ghost([{ id: 1, kind: "scale", optionId: 10, factor: 0.75 }]);
  const shake = breakfast.parts[0].options[0];
  assert.equal(shake.baseKcal, 600);
  assert.equal(shake.kcal, 450);
  assert.equal(shake.factor, 0.75);
  assert.equal(shake.status, "base");
});

test("a dropped meal stays in its place as a ghost with no calories", () => {
  const [breakfast] = ghost([{ id: 1, kind: "remove", optionId: 11 }]);
  const greens = breakfast.parts[1].options[0];
  assert.equal(greens.status, "dropped");
  assert.equal(greens.baseKcal, 50);
  assert.equal(greens.kcal, 0);
  assert.equal(greens.option.meal.name, "Greens");
});

test("dropping one variation leaves the others where they were", () => {
  const [, dinner] = ghost([{ id: 1, kind: "remove", optionId: 21 }]);
  assert.deepEqual(dinner.parts[0].options.map((b) => [b.option.meal.name, b.status]), [["Chicken", "base"], ["Beef", "dropped"]]);
});

test("an added food is listed on its slot with no base calories", () => {
  const [, dinner] = ghost([{ id: 7, kind: "add", slotId: 2, mealId: 5, ingredientId: null, qty: 1.5 }]);
  assert.equal(dinner.parts.length, 1);
  assert.equal(dinner.added.length, 1);
  const [rice] = dinner.added;
  assert.equal(rice.status, "added");
  assert.equal(rice.baseKcal, 0);
  assert.equal(rice.kcal, 300);
});

test("choosing another variation moves the planned flag", () => {
  const [, dinner] = ghost([{ id: 1, kind: "plan", optionId: 21 }]);
  assert.deepEqual(dinner.parts[0].options.map((b) => b.planned), [false, true]);
});

test("block height follows calories but never drops below the minimum", () => {
  assert.equal(blockHeight(600, 0.2, 30), 120);
  assert.equal(blockHeight(50, 0.2, 30), 30);
});
