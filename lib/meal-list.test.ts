import { test } from "node:test";
import assert from "node:assert/strict";
import { groupBySwaps, mealSlots, nextMealSort, parseMealSort, sortMeals, swapGroups } from "./meal-list.ts";

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

test("swaps are the parts of the day with two or more meals to pick from", () => {
  const part = (...ids: number[]) => ({ options: ids.map((id) => ({ meal: { id } })) });
  assert.deepEqual(swapGroups([{ parts: [part(1), part(2, 3)] }, { parts: [part(4, 5, 6)] }]), [[2, 3], [4, 5, 6]]);
});

test("swap groups stay together in the day's order, rows keep their order, the rest comes last", () => {
  const listed = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id }));
  const ids = (groups: { id: number }[][]) => groups.map((g) => g.map((m) => m.id));
  assert.deepEqual(ids(groupBySwaps(listed, [[6, 2], [5, 3, 1]])), [[2, 6], [1, 3, 5], [4, 7]]);
  assert.deepEqual(ids(groupBySwaps(listed, [])), [[1, 2, 3, 4, 5, 6, 7]]);
  // One meal of a group left (the others filtered out) is not a group; a meal in two groups goes with the first.
  assert.deepEqual(ids(groupBySwaps(listed.slice(0, 4), [[1, 9], [2, 3], [3, 4]])), [[2, 3], [1, 4]]);
  assert.deepEqual(ids(groupBySwaps(listed.slice(0, 2), [[1, 2]])), [[1, 2]]);
});
