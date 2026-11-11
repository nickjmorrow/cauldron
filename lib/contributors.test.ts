import test from "node:test";
import assert from "node:assert/strict";
import { topContributors } from "./contributors.ts";
import { partKey } from "./chosen.ts";
import type { Slot } from "./queries.ts";

// Hand-built slots: no database involved.
const meal = (name: string, totals: Record<string, number>) => ({ id: 1, name, totals, items: [] }) as never;
const slots: Slot[] = [
  { id: 1, name: "Breakfast", parts: [
    { part: 0, options: [{ optionId: 10, meal: meal("Shake", { protein: 40, calories: 600 }), isPlanned: true }] },
    { part: 1, options: [{ optionId: 11, meal: meal("Greens", { protein: 3, calories: 50 }), isPlanned: true }] },
  ] },
  { id: 2, name: "Dinner", parts: [
    { part: 0, options: [
      { optionId: 20, meal: meal("Chicken bowl", { protein: 55, calories: 700 }), isPlanned: true },
      { optionId: 21, meal: meal("Salmon bowl", { protein: 38, calories: 640 }), isPlanned: false },
    ] },
  ] },
];

test("meals are ranked by what they add, with their share of the day", () => {
  const r = topContributors(slots, {}, "protein", 5);
  assert.equal(r.total, 98); // 40 + 3 + 55, the planned dinner
  assert.deepEqual(r.items.map((i) => [i.meal, i.slot, i.amount]), [["Chicken bowl", "Dinner", 55], ["Shake", "Breakfast", 40], ["Greens", "Breakfast", 3]]);
  assert.equal(Math.round(r.items[0].share * 100), 56);
});

test("the limit keeps only the biggest contributors", () => {
  assert.deepEqual(topContributors(slots, {}, "protein", 2).items.map((i) => i.meal), ["Chicken bowl", "Shake"]);
});

test("a chosen variation replaces the planned option", () => {
  const r = topContributors(slots, { [partKey(2, 0)]: 21 }, "protein", 5);
  assert.equal(r.total, 81); // 40 + 3 + 38
  assert.equal(r.items[0].meal, "Shake");
});

test("a nutrient nothing contains has no contributors", () => {
  assert.deepEqual(topContributors(slots, {}, "zinc", 5), { total: 0, items: [] });
});
