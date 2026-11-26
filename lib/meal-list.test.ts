import { test } from "node:test";
import assert from "node:assert/strict";
import { describeParts, mealSlots, mealsBySlot, nextMealSort, parseMealSort, sortMeals } from "./meal-list.ts";

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

const part = (...ids: number[]) => ({ options: ids.map((id) => ({ meal: { id } })) });
const DAY = [
  { name: "Breakfast", parts: [part(1), part(2, 3)] },
  { name: "Lunch", parts: [part(4, 5)] },
  { name: "Dinner", parts: [part(8, 6), part(7, 9)] },
];
const shape = (sections: { slot: string | null; parts: { id: number }[][] }[]) => sections.map((s) => [s.slot, s.parts.map((p) => p.map((m) => m.id))]);

test("meals are laid out by the day's slots and their parts, rows in the order given, the rest last", () => {
  const listed = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((id) => ({ id }));
  assert.deepEqual(shape(mealsBySlot(listed, DAY)), [
    ["Breakfast", [[1], [2, 3]]], ["Lunch", [[4, 5]]], ["Dinner", [[6, 8], [7, 9]]], [null, [[10, 11]]],
  ]);
  assert.deepEqual(shape(mealsBySlot(listed.slice(0, 5), DAY)), [["Breakfast", [[1], [2, 3]]], ["Lunch", [[4, 5]]]]);
});

test("parts and slots with nothing to show are left out; a meal in two parts goes with the first", () => {
  const listed = [3, 9, 12].map((id) => ({ id }));
  assert.deepEqual(shape(mealsBySlot(listed, [...DAY, { name: "Snack", parts: [part(9, 3)] }])), [["Breakfast", [[3]]], ["Dinner", [[9]]], [null, [[12]]]]);
  assert.deepEqual(shape(mealsBySlot(listed, [])), [[null, [[3, 9, 12]]]]);
  assert.deepEqual(mealsBySlot([], DAY), []);
});

test("a slot's heading says how it's put together", () => {
  assert.equal(describeParts([[1, 2, 3]]), "one of 3");
  assert.equal(describeParts([[1], [2, 3]]), "2 parts eaten together");
  assert.equal(describeParts([[1]]), "");
});
