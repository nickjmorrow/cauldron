import { test } from "node:test";
import assert from "node:assert/strict";
import { mealSlots, nextMealSort, parseMealSort, sortMeals } from "./meal-list.ts";

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
  assert.deepEqual(names(sortMeals(meals, { key: "slot", dir: "asc" })), ["Apple", "Oats", "Burrito", "Chili"]);
  assert.deepEqual(names(sortMeals(meals, { key: "calories", dir: "desc" })), ["Burrito", "Chili", "Oats", "Apple"]);
  assert.deepEqual(names(sortMeals(meals, { key: "protein", dir: "asc" })), ["Apple", "Oats", "Burrito", "Chili"]);
  assert.equal(meals[0].name, "Oats");
});

test("slots are the distinct non-empty ones, A to Z", () => {
  assert.deepEqual(mealSlots(meals), ["Breakfast", "Dinner"]);
});
