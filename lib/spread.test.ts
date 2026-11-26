import test from "node:test";
import assert from "node:assert/strict";
import { daySpread, standout, BINS } from "./spread.ts";
import type { Slot } from "./queries.ts";

// Hand-built slots: no database involved. Each option is a meal with only calories.
let nextId = 1;
const opt = (name: string, calories: number, isPlanned = false) => ({ optionId: nextId++, meal: { id: nextId, name, totals: { calories }, items: [] } as never, isPlanned });
const slot = (id: number, name: string, parts: ReturnType<typeof opt>[][]): Slot => ({ id, name, parts: parts.map((options, part) => ({ part, options })) });

const day: Slot[] = [
  slot(1, "Breakfast", [[opt("Shake", 500, true)]]),
  slot(2, "Dinner", [
    [opt("Chicken", 100, true), opt("Beef", 200)],
    [opt("Soy sauce", 10, true), opt("Chili sauce", 50)],
  ]),
];

test("a day with no variations is one combination with no spread", () => {
  const { combos, nutrients, parts } = daySpread([day[0]], ["calories"]);
  assert.equal(combos, 1);
  assert.equal(parts.length, 0);
  const c = nutrients.calories;
  assert.deepEqual([c.min, c.max, c.mean], [500, 500, 500]);
  assert.equal(c.driver, undefined);
});

test("every combination counts once: bounds, mean and bins", () => {
  const { combos, nutrients, sampled } = daySpread(day, ["calories"]);
  assert.equal(combos, 4);
  assert.equal(sampled, false);
  const c = nutrients.calories;
  assert.deepEqual([c.min, c.max, c.mean], [610, 750, 680]);
  assert.equal(c.bins.length, BINS);
  assert.equal(c.bins.reduce((a, b) => a + b, 0), 4);
  assert.equal(c.bins[0], 1); // 610 is the lowest day
  assert.equal(c.bins[BINS - 1], 1); // 750 the highest
});

test("names the lowest and highest possible day", () => {
  const c = daySpread(day, ["calories"]).nutrients.calories;
  assert.deepEqual(c.low, ["Chicken", "Soy sauce"]);
  assert.deepEqual(c.high, ["Beef", "Chili sauce"]);
});

test("the part whose choice moves a nutrient most is its driver, with its share", () => {
  const c = daySpread(day, ["calories"]).nutrients.calories;
  assert.equal(c.driver?.part.options[0].name, "Chicken");
  assert.equal(Math.round(c.driver!.share * 100), 71); // 100 of 140
});

test("shows the average for each choice within a part", () => {
  const c = daySpread(day, ["calories"]).nutrients.calories;
  const mains = c.byChoice[0].means.map((m) => [m.name, m.mean]);
  assert.deepEqual(mains, [["Chicken", 630], ["Beef", 730]]);
});

test("a huge number of combinations is sampled evenly instead of listed", () => {
  const many = Array.from({ length: 3 }, (_, p) => Array.from({ length: 30 }, (_, i) => opt(`P${p}-${i}`, i * 10, i === 0)));
  const big: Slot[] = [slot(9, "Big", many)];
  const { combos, nutrients, sampled } = daySpread(big, ["calories"], 1000);
  assert.equal(sampled, true);
  assert.ok(combos <= 1000);
  const exactMean = 3 * 145; // each part averages 145
  assert.ok(Math.abs(nutrients.calories.mean - exactMean) < 5);
});

test("names a part by the start of each of its meals", () => {
  const { parts } = daySpread(day, ["calories"]);
  assert.equal(parts[0].label, "Chicken / Beef");
  assert.equal(parts[0].slotName, "Dinner");
});

test("the standout is the one variation furthest from its meal's other variations", () => {
  const meals: Slot[] = [
    slot(3, "Breakfast", [[opt("Oats", 400), opt("Eggs", 420), opt("Pancakes", 900)]]),
    slot(4, "Dinner", [[opt("Chicken", 500), opt("Beef", 560)]]),
  ];
  const s = daySpread(meals, ["calories"]).nutrients.calories;
  assert.deepEqual(standout(s), { name: "Pancakes", slotName: "Breakfast", delta: 490 }); // 900 against the average of 400 and 420
  assert.equal(standout(daySpread([day[0]], ["calories"]).nutrients.calories), undefined, "no variations, nothing stands out");
});

test("a fixed daily amount lifts every combination and leaves the swing alone", () => {
  const plain = daySpread(day, ["calories", "zinc"]).nutrients;
  const lifted = daySpread(day, ["calories", "zinc"], undefined, { calories: 25, zinc: 15 }).nutrients;
  assert.equal(lifted.calories.min, plain.calories.min + 25);
  assert.equal(lifted.calories.max, plain.calories.max + 25);
  assert.equal(lifted.calories.mean, plain.calories.mean + 25);
  assert.deepEqual([lifted.zinc.min, lifted.zinc.max], [15, 15], "a nutrient no meal has still shows");
  assert.deepEqual(standout(lifted.calories), standout(plain.calories));
});
