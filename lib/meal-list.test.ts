import { test } from "node:test";
import assert from "node:assert/strict";
import { mealBoard, mealSlots, nextMealSort, parseMealSort, slotTotals, sortMeals } from "./meal-list.ts";

const meals = [
  { name: "Oats", typical_slot: "Breakfast", totals: { calories: 400, protein: 20 } },
  { name: "Chili", typical_slot: "Dinner", totals: { calories: 600, protein: 45 } },
  { name: "Apple", typical_slot: "", totals: { calories: 95 } },
  { name: "Burrito", typical_slot: "Dinner", totals: { calories: 600, protein: 30 } },
];
const names = (list: { name: string }[]) => list.map((m) => m.name);

test("sort defaults to name A to Z; unknown values fall back", () => {
  assert.deepEqual(parseMealSort(undefined, undefined), { key: "name", dir: "asc" });
  assert.deepEqual(parseMealSort("weight", "sideways"), { key: "name", dir: "asc" });
  assert.deepEqual(parseMealSort("protein", undefined), { key: "protein", dir: "desc" });
  assert.deepEqual(parseMealSort("protein", "asc"), { key: "protein", dir: "asc" });
});

test("a heading click starts a nutrient at the biggest and flips the sorted column", () => {
  const byName = parseMealSort(undefined, undefined);
  assert.deepEqual(nextMealSort(byName, "name"), { key: "name", dir: "desc" });
  assert.deepEqual(nextMealSort(byName, "fat"), { key: "fat", dir: "desc" });
  assert.deepEqual(nextMealSort({ key: "fat", dir: "desc" }, "fat"), { key: "fat", dir: "asc" });
  assert.deepEqual(nextMealSort({ key: "fat", dir: "asc" }, "slot"), { key: "slot", dir: "asc" });
});

test("sorts by name, slot and nutrient; ties go by name; a missing nutrient counts as 0", () => {
  assert.deepEqual(names(sortMeals(meals, { key: "name", dir: "asc" })), ["Apple", "Burrito", "Chili", "Oats"]);
  assert.deepEqual(names(sortMeals(meals, { key: "name", dir: "desc" })), ["Oats", "Chili", "Burrito", "Apple"]);
  assert.deepEqual(names(sortMeals(meals, { key: "slot", dir: "asc" })), ["Oats", "Burrito", "Chili", "Apple"]);
  assert.deepEqual(names(sortMeals(meals, { key: "calories", dir: "desc" })), ["Burrito", "Chili", "Oats", "Apple"]);
  assert.deepEqual(names(sortMeals(meals, { key: "protein", dir: "asc" })), ["Apple", "Oats", "Burrito", "Chili"]);
  assert.equal(meals[0].name, "Oats");
});

test("slots are the distinct non-empty ones, A to Z", () => {
  assert.deepEqual(mealSlots(meals), ["Breakfast", "Dinner"]);
});

test("meal times keep the order of a day, then anything else A to Z", () => {
  const slots = ["Snack", "Dinner", "Baking", "Lunch", "Breakfast"].map((typical_slot) => ({ typical_slot }));
  assert.deepEqual(mealSlots(slots), ["Breakfast", "Lunch", "Dinner", "Baking", "Snack"]);
});

// The first meal of a part is the planned one.
const part = (number: number, name: string, ...ids: number[]) => ({ part: number, name, options: ids.map((id, i) => ({ meal: { id }, isPlanned: i === 0 })) });
const DAY = [
  { id: 1, name: "Breakfast", parts: [part(0, "", 1), part(1, "Main", 2, 3)] },
  { id: 2, name: "Lunch", parts: [part(0, "", 4, 5)] },
  { id: 3, name: "Dinner", parts: [part(0, "Meat", 8, 6), part(2, "Sauce", 7, 9)] },
];
const shape = (board: { slots: { name: string; parts: { name: string; meals: { id: number }[]; planned?: { id: number } }[] }[]; rest: { id: number }[] }) =>
  [...board.slots.map((s) => [s.name, ...s.parts.map((p) => `${p.name}:${p.meals.map((m) => m.id)}:${p.planned?.id ?? "-"}`)]), board.rest.map((m) => m.id)];

test("meals are laid out by the day's slots and named parts, in the order given, with the planned one marked and the rest apart", () => {
  const listed = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((id) => ({ id }));
  assert.deepEqual(shape(mealBoard(listed, DAY)), [
    ["Breakfast", ":1:1", "Main:2,3:2"], ["Lunch", ":4,5:4"], ["Dinner", "Meat:6,8:8", "Sauce:7,9:7"], [10, 11],
  ]);
});

test("parts and slots with nothing to show are left out; a meal in two parts goes with the first; a hidden planned meal isn't marked", () => {
  const listed = [3, 9, 12].map((id) => ({ id }));
  assert.deepEqual(shape(mealBoard(listed, [...DAY, { id: 4, name: "Snack", parts: [part(0, "", 9, 3)] }])), [["Breakfast", "Main:3:-"], ["Dinner", "Sauce:9:-"], [12]]);
  assert.deepEqual(shape(mealBoard(listed, [])), [[3, 9, 12]]);
  assert.deepEqual(shape(mealBoard([], DAY)), [[]]);
});

test("a slot adds up to its planned meals, and to the lightest and heaviest swap of each part", () => {
  const food = (id: number, calories?: number) => ({ id, name: `m${id}`, typical_slot: "", totals: { calories } });
  const board = mealBoard([food(6, 300), food(8, 350), food(7, 80), food(9)], DAY);
  assert.deepEqual(slotTotals(board.slots[0].parts, "calories"), { planned: 350 + 80, low: 300 + 0, high: 350 + 80 });
  const unplanned = mealBoard([food(6, 300), food(7, 80), food(9, 20)], DAY); // the planned meat is hidden: the first shown stands in
  assert.equal(slotTotals(unplanned.slots[0].parts, "calories").planned, 300 + 80);
});
