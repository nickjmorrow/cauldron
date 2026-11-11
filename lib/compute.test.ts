import test from "node:test";
import assert from "node:assert/strict";
import { mealTotals, dayTotals, judge, looksDairy } from "./compute.ts";

test("meal totals scale each ingredient by qty", () => {
  const shake = { nutrients: { calories: 400, protein: 40 }, qty: 1 };
  const oat = { nutrients: { calories: 160, protein: 3 }, qty: 1.5 };
  const t = mealTotals([shake, oat]);
  assert.equal(t.calories, 640);
  assert.equal(t.protein, 44.5); // 40 + 3 * 1.5
});

test("a nutrient missing from every ingredient stays missing", () => {
  assert.equal(mealTotals([{ nutrients: { calories: 10 }, qty: 2 }]).protein, undefined);
});

test("day totals add the chosen meals", () => {
  assert.equal(dayTotals([{ calories: 600 }, { calories: 500 }]).calories, 1100);
});

test("judge: at-least and no-more-than directions", () => {
  assert.equal(judge(30, 28, "at_least").verdict, "good");
  assert.equal(judge(26, 28, "at_least").verdict, "close");
  assert.equal(judge(10, 28, "at_least").verdict, "bad");
  assert.equal(judge(2421, 2300, "no_more_than").verdict, "close");
  assert.equal(judge(25, 50, "no_more_than").verdict, "good");
});

test("dairy detection keeps plant milks and peanut butter out", () => {
  assert.equal(looksDairy("Butter, Salted"), true);
  assert.equal(looksDairy("Cheese, cheddar"), true);
  assert.equal(looksDairy("Oatly, Oatmilk, Full Fat"), false);
  assert.equal(looksDairy("Peanut butter, smooth"), false);
  assert.equal(looksDairy("Egg, Whole, Raw, Jumbo", "Dairy and Egg Products"), false);
});

import { mapNutrients } from "./usda.ts";

test("USDA mapping: sums omega fats, derives net carbs, leaves unreported nutrients out", () => {
  const n = mapNutrients({ fdcId: 1, description: "x", foodNutrients: [
    { nutrientNumber: "208", value: 208 }, { nutrientNumber: "205", value: 10 }, { nutrientNumber: "291", value: 4 },
    { nutrientNumber: "619", value: 0.2 }, { nutrientNumber: "629", value: 0.7 }, { nutrientNumber: "621", value: 1.1 },
  ] });
  assert.equal(n.calories, 208);
  assert.equal(n.net_carbs, 6);
  assert.ok(Math.abs(n.omega3! - 2) < 1e-9);
  assert.equal(n.added_sugars, undefined);
});

test("judge: targets without a direction are a band around the target", () => {
  assert.equal(judge(2448, 2425, null).verdict, "good");
  assert.equal(judge(2200, 2425, null).verdict, "close");
  assert.equal(judge(1800, 2425, null).verdict, "bad");
});
