import test from "node:test";
import assert from "node:assert/strict";
import { validPlacements } from "./placements.ts";

const ingredients = new Map([["Salmon", 1], ["Rice", 2]]);
const areas = new Map([["Fridge", 10], ["Freezer", 11], ["Pantry", 12]]);

test("keeps known ingredients and areas, at most two areas each", () => {
  const { pairs, unmatched } = validPlacements({ placements: [
    { ingredient: "Salmon", areas: ["Fridge", "Freezer", "Pantry"] },
    { ingredient: "Rice", areas: ["Pantry"] },
  ] }, ingredients, areas);
  assert.deepEqual(pairs, [
    { ingredientId: 1, locationId: 10 }, { ingredientId: 1, locationId: 11 }, { ingredientId: 2, locationId: 12 },
  ]);
  assert.deepEqual(unmatched, []);
});

test("reports names the model invented instead of guessing", () => {
  const { pairs, unmatched } = validPlacements({ placements: [
    { ingredient: "Unicorn meat", areas: ["Fridge"] },
    { ingredient: "Rice", areas: ["Garage"] },
  ] }, ingredients, areas);
  assert.deepEqual(pairs, []);
  assert.deepEqual(unmatched, ["Unicorn meat", "Rice → Garage"]);
});

test("the same pair is only returned once", () => {
  const { pairs } = validPlacements({ placements: [
    { ingredient: "Rice", areas: ["Pantry", "Pantry"] },
    { ingredient: "Rice", areas: ["Pantry"] },
  ] }, ingredients, areas);
  assert.equal(pairs.length, 1);
});
