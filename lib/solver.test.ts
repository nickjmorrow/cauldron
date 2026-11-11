import test from "node:test";
import assert from "node:assert/strict";
import { solve, totalsOf, type Goal, type SolveInput, type SolverOption, type PoolFood } from "./solver.ts";
import { resolveVersion, type Adjustment } from "./resolve.ts";
import { totalsForChoice, type Slot } from "./queries.ts";

// Slot 1 breakfast, slot 2 dinner. Option 10 is the shake, 20 chicken (planned), 21 salmon (a variation).
const option = (optionId: number, slotId: number, planned: boolean, nutrients: SolverOption["nutrients"], part = 0): SolverOption => ({ optionId, slotId, part, planned, nutrients });
const OPTIONS: SolverOption[] = [
  option(10, 1, true, { calories: 600, protein: 40, fiber: 10, sodium: 800 }),
  option(20, 2, true, { calories: 700, protein: 55, fiber: 10, sodium: 1200 }),
  option(21, 2, false, { calories: 640, protein: 38, fiber: 8, sodium: 900 }),
];
const bean: PoolFood = { ingredientId: 7, name: "Beans", nutrients: { calories: 100, fiber: 8, protein: 6 }, slotIds: [2] }; // maxQty defaults to the solver's own limit
const goal = (g: Partial<Goal> & Pick<Goal, "key" | "target">): Goal => ({ type: null, weight: 1, ...g });
const input = (over: Partial<SolveInput>): SolveInput => ({ options: OPTIONS, mealNutrients: {}, pool: [], goals: [], start: [], ...over });
const adds = (r: { adjustments: Adjustment[] }) => r.adjustments.flatMap((a) => (a.kind === "add" ? [a] : []));

test("a shortfall is closed by adding a food from the pool, no more than needed", () => {
  const r = solve(input({ pool: [bean], goals: [goal({ key: "fiber", target: 28, type: "at_least" })] }));
  assert.equal(r.before.fiber, 20);
  assert.equal(r.after.fiber, 28);
  assert.deepEqual(adds(r).map((a) => [a.slotId, a.ingredientId, a.qty]), [[2, 7, 1]]);
});

test("foods are only added to the slots they are allowed in", () => {
  const breakfastOnly = { ...bean, slotIds: [1] };
  const r = solve(input({ pool: [breakfastOnly], goals: [goal({ key: "fiber", target: 28, type: "at_least" })] }));
  assert.ok(adds(r).length > 0 && adds(r).every((a) => a.slotId === 1));
});

test("a nutrient over its upper limit is brought down by scaling meals", () => {
  const r = solve(input({ goals: [goal({ key: "sodium", target: 1800, type: "no_more_than", weight: 3 })] }));
  assert.ok(r.before.sodium! > 1800);
  assert.ok(r.after.sodium! <= 1800, `sodium ${r.after.sodium}`);
});

test("over target is left alone when the user allows it, and a hard ceiling still wins", () => {
  const tolerated = solve(input({ goals: [goal({ key: "protein", target: 87, okUpTo: 176, hardCeiling: 176 })] }));
  assert.deepEqual(tolerated.adjustments, []);
  const capped = solve(input({ goals: [goal({ key: "protein", target: 87, okUpTo: 100, hardCeiling: 100 })] }));
  assert.ok(capped.after.protein! <= 100, `protein ${capped.after.protein}`);
});

test("without a tolerance, being over an aim-for target is reduced", () => {
  const r = solve(input({ goals: [goal({ key: "protein", target: 87 })] }));
  assert.ok(r.after.protein! < r.before.protein!);
});

test("a food is never added past a hard ceiling", () => {
  const rich: PoolFood = { ingredientId: 8, name: "Tuna", nutrients: { protein: 30, calories: 120 }, slotIds: [1, 2] };
  const r = solve(input({ pool: [rich], goals: [goal({ key: "protein", target: 200, okUpTo: 120, hardCeiling: 120, weight: 3 })] }));
  assert.ok(r.after.protein! <= 120, `protein ${r.after.protein}`);
});

test("meals the user dropped stay dropped, and the planned variation is not changed", () => {
  const start: Adjustment[] = [{ id: 1, kind: "remove", optionId: 10 }, { id: 2, kind: "plan", optionId: 21 }];
  const r = solve(input({ start, goals: [goal({ key: "calories", target: 3000, weight: 4 })], pool: [bean] }));
  assert.ok(r.adjustments.some((a) => a.kind === "remove" && a.optionId === 10));
  assert.ok(r.adjustments.some((a) => a.kind === "plan" && a.optionId === 21));
  assert.ok(!r.adjustments.some((a) => a.kind === "scale" && a.optionId === 10), "no scaling a dropped meal");
});

test("a slot is never left empty", () => {
  // Wanting almost no calories tempts dropping meals, but each slot keeps at least one.
  const r = solve(input({ goals: [goal({ key: "calories", target: 100, weight: 4 })] }));
  for (const slotId of [1, 2]) {
    const gone = new Set(r.adjustments.flatMap((a) => (a.kind === "remove" ? [a.optionId] : [])));
    assert.ok(OPTIONS.filter((o) => o.slotId === slotId).some((o) => !gone.has(o.optionId)), `slot ${slotId} emptied`);
  }
});

test("the same input always gives the same answer and the input is not changed", () => {
  const i = input({ pool: [bean], goals: [goal({ key: "fiber", target: 28, type: "at_least" }), goal({ key: "calories", target: 1500, weight: 4 })] });
  const copy = JSON.stringify(i);
  assert.deepEqual(solve(i), solve(i));
  assert.equal(JSON.stringify(i), copy);
});

test("an already good day comes back unchanged", () => {
  const r = solve(input({ goals: [goal({ key: "calories", target: 1300, weight: 4 })] }));
  assert.deepEqual(r.adjustments, []);
});

test("totalsOf agrees with how the page resolves a version", () => {
  const meal = (id: number, nutrients: Record<string, number>) => ({ id, name: `m${id}`, totals: nutrients, items: [], status: "approved" }) as never;
  const slots: Slot[] = [
    { id: 1, name: "Breakfast", parts: [{ part: 0, options: [{ optionId: 10, meal: meal(1, OPTIONS[0].nutrients as Record<string, number>), isPlanned: true }] }] },
    { id: 2, name: "Dinner", parts: [{ part: 0, options: [
      { optionId: 20, meal: meal(2, OPTIONS[1].nutrients as Record<string, number>), isPlanned: true },
      { optionId: 21, meal: meal(3, OPTIONS[2].nutrients as Record<string, number>), isPlanned: false },
    ] }] },
  ];
  const adjustments: Adjustment[] = [
    { id: 1, kind: "scale", optionId: 10, factor: 0.75 },
    { id: 2, kind: "plan", optionId: 21 },
    { id: 3, kind: "add", slotId: 2, mealId: null, ingredientId: 7, qty: 1.5 },
  ];
  const ingredient = { id: 7, name: "Beans", serving: "1 cup", nutrients: bean.nutrients, status: "approved" } as never;
  const resolved = resolveVersion(slots, adjustments, { meal: () => undefined, ingredient: () => ingredient });
  const expected = totalsForChoice({ slots: resolved });
  const actual = totalsOf({ options: OPTIONS, mealNutrients: {}, pool: [bean] }, adjustments);
  for (const key of ["calories", "protein", "fiber", "sodium"] as const) assert.ok(Math.abs((actual[key] ?? 0) - (expected[key] ?? 0)) < 1e-9, key);
});

test("meals are only ever made smaller, never bigger than the base portion", () => {
  const r = solve(input({ pool: [bean], goals: [goal({ key: "fiber", target: 40, type: "at_least" }), goal({ key: "calories", target: 3000, weight: 4 })] }));
  for (const a of r.adjustments) if (a.kind === "scale") assert.ok(a.factor < 1, `factor ${a.factor}`);
});

test("a food is never added beyond its own cap", () => {
  const condiment: PoolFood = { ingredientId: 9, name: "Lime juice", nutrients: { fiber: 40, calories: 30 }, slotIds: [2], maxQty: 0.5 };
  const r = solve(input({ pool: [condiment], goals: [goal({ key: "fiber", target: 100, type: "at_least", weight: 5 })] }));
  assert.ok(adds(r).every((a) => a.qty <= 0.5), JSON.stringify(adds(r)));
  assert.ok(adds(r).length > 0, "it should still use the food up to its cap");
});

test("a suggestion adds at most six foods", () => {
  const many: PoolFood[] = Array.from({ length: 8 }, (_, i) => ({ ingredientId: 20 + i, name: `Food ${i}`, nutrients: { fiber: 3 }, slotIds: [1, 2] }));
  const r = solve(input({ pool: many, goals: [goal({ key: "fiber", target: 200, type: "at_least", weight: 5 })] }));
  assert.ok(adds(r).length <= 6, `${adds(r).length} foods`);
});

test("nothing is added to a slot that has no meal left", () => {
  const start: Adjustment[] = [{ id: 1, kind: "remove", optionId: 10 }]; // breakfast has only the shake
  const everywhere: PoolFood = { ...bean, slotIds: [1, 2] };
  const r = solve(input({ start, pool: [everywhere], goals: [goal({ key: "fiber", target: 60, type: "at_least", weight: 5 })] }));
  assert.ok(adds(r).length > 0 && adds(r).every((a) => a.slotId === 2), JSON.stringify(adds(r)));
});
