import test from "node:test";
import assert from "node:assert/strict";
import { resolveVersion, type Adjustment } from "./resolve.ts";
import type { Slot } from "./queries.ts";

const meal = (id: number, name: string, totals: Record<string, number>) => ({ id, name, totals, items: [], status: "approved" }) as never;
const shake = meal(1, "Shake", { calories: 600, protein: 40 });
const greens = meal(2, "Greens", { calories: 50, protein: 3 });
const chicken = meal(3, "Chicken bowl", { calories: 700, protein: 55 });
const salmon = meal(4, "Salmon bowl", { calories: 640, protein: 38 });
const banana = { id: 5, name: "Banana", serving: "1 medium", nutrients: { calories: 100, protein: 1 }, status: "approved" } as never;

const base: Slot[] = [
  { id: 1, name: "Breakfast", parts: [
    { part: 0, options: [{ optionId: 10, meal: shake, isPlanned: true }] },
    { part: 1, options: [{ optionId: 11, meal: greens, isPlanned: true }] },
  ] },
  { id: 2, name: "Dinner", parts: [
    { part: 0, options: [{ optionId: 20, meal: chicken, isPlanned: true }, { optionId: 21, meal: salmon, isPlanned: false }] },
  ] },
];
const lookup = {
  meal: (id: number) => [shake, greens, chicken, salmon].find((m) => (m as { id: number }).id === id),
  ingredient: (id: number) => (id === 5 ? banana : undefined),
};
const options = (slots: Slot[]) => slots.flatMap((s) => s.parts.flatMap((p) => p.options.map((o) => `${s.name}/${(o.meal as { name: string }).name}`)));

test("with no adjustments a version is the base day", () => {
  assert.deepEqual(resolveVersion(base, [], lookup), base);
});

test("a removed meal disappears, and its part goes with it", () => {
  const out = resolveVersion(base, [{ id: 1, kind: "remove", optionId: 11 }], lookup);
  assert.deepEqual(options(out), ["Breakfast/Shake", "Dinner/Chicken bowl", "Dinner/Salmon bowl"]);
  assert.equal(out[0].parts.length, 1);
});

test("removing the planned variation leaves the other one eaten", () => {
  const out = resolveVersion(base, [{ id: 1, kind: "remove", optionId: 20 }], lookup);
  assert.deepEqual(options(out).filter((o) => o.startsWith("Dinner")), ["Dinner/Salmon bowl"]);
});

test("a scaled meal keeps its name and scales every nutrient", () => {
  const out = resolveVersion(base, [{ id: 2, kind: "scale", optionId: 10, factor: 0.5 }], lookup);
  const scaled = out[0].parts[0].options[0];
  assert.equal((scaled.meal as { name: string }).name, "Shake");
  assert.deepEqual(scaled.meal.totals, { calories: 300, protein: 20 });
  assert.deepEqual(scaled.adjust, { kind: "scale", adjustmentId: 2, factor: 0.5 });
  assert.equal(base[0].parts[0].options[0].meal.totals.calories, 600, "the base day must not change");
});

test("an added ingredient becomes its own part with its quantity applied", () => {
  const out = resolveVersion(base, [{ id: 3, kind: "add", slotId: 2, mealId: null, ingredientId: 5, qty: 1.5 }], lookup);
  const added = out[1].parts.at(-1)!.options[0];
  assert.equal((added.meal as { name: string }).name, "Banana");
  assert.deepEqual(added.meal.totals, { calories: 150, protein: 1.5 });
  assert.equal(added.optionId, -3);
  assert.equal(added.isPlanned, true);
  assert.deepEqual(added.adjust, { kind: "add", adjustmentId: 3, qty: 1.5, ingredientId: 5, mealId: null });
  assert.equal(out[1].parts.length, 2);
});

test("an added meal is scaled by its quantity", () => {
  const out = resolveVersion(base, [{ id: 4, kind: "add", slotId: 1, mealId: 2, ingredientId: null, qty: 2 }], lookup);
  assert.deepEqual(out[0].parts.at(-1)!.options[0].meal.totals, { calories: 100, protein: 6 });
});

test("several additions to one slot each get their own part", () => {
  const adds: Adjustment[] = [
    { id: 5, kind: "add", slotId: 1, mealId: null, ingredientId: 5, qty: 1 },
    { id: 6, kind: "add", slotId: 1, mealId: null, ingredientId: 5, qty: 2 },
  ];
  const parts = resolveVersion(base, adds, lookup)[0].parts.map((p) => p.part);
  assert.equal(new Set(parts).size, 4);
});

test("adjustments that point at things which no longer exist are ignored", () => {
  const stale: Adjustment[] = [
    { id: 7, kind: "remove", optionId: 999 },
    { id: 8, kind: "scale", optionId: 998, factor: 0.5 },
    { id: 9, kind: "add", slotId: 997, mealId: 1, ingredientId: null, qty: 1 },
    { id: 10, kind: "add", slotId: 1, mealId: null, ingredientId: 996, qty: 1 },
  ];
  assert.deepEqual(resolveVersion(base, stale, lookup), base);
});

test("a plan adjustment picks which variation of a part is the planned one", () => {
  const out = resolveVersion(base, [{ id: 11, kind: "plan", optionId: 21 }], lookup);
  const dinner = out[1].parts[0].options;
  assert.deepEqual(dinner.map((o) => [(o.meal as { name: string }).name, o.isPlanned]), [["Chicken bowl", false], ["Salmon bowl", true]]);
  assert.equal(base[1].parts[0].options[0].isPlanned, true, "the base day keeps its own planned meal");
});

test("a plan adjustment for a removed or missing meal changes nothing", () => {
  const removedToo: Adjustment[] = [{ id: 12, kind: "remove", optionId: 21 }, { id: 13, kind: "plan", optionId: 21 }, { id: 14, kind: "plan", optionId: 999 }];
  assert.deepEqual(options(resolveVersion(base, removedToo, lookup)).filter((o) => o.startsWith("Dinner")), ["Dinner/Chicken bowl"]);
  assert.equal(resolveVersion(base, removedToo, lookup)[1].parts[0].options[0].isPlanned, true);
});
