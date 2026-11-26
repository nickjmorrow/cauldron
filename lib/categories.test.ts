import test from "node:test";
import assert from "node:assert/strict";
import { areaOf, groupByArea, groupByCategory, HOMEMADE, UNCATEGORIZED } from "./categories.ts";

test("groups follow the category order, skip empty ones, and put unknown or blank categories last", () => {
  const groups = groupByCategory([
    { name: "Olive oil", category: "Oils & vinegars" },
    { name: "Mystery", category: "" },
    { name: "Apple", category: "Fruit" },
    { name: "Odd", category: "Not a category" },
    { name: "Banana", category: "Fruit" },
  ]);
  assert.deepEqual(groups.map((g) => [g.category, g.items.map((i) => i.name)]), [
    ["Fruit", ["Apple", "Banana"]],
    ["Oils & vinegars", ["Olive oil"]],
    [UNCATEGORIZED, ["Mystery", "Odd"]],
  ]);
});

test("an ingredient is in the aisle it was given, else where its category is kept, else nowhere known", () => {
  assert.equal(areaOf({ aisle: "5", category: "Vegetables" }), "5");
  assert.equal(areaOf({ aisle: "", category: "Vegetables" }), "Produce");
  assert.equal(areaOf({ aisle: "", category: "Spices & seasonings" }), "");
  assert.equal(areaOf({ aisle: "", category: "" }), "");
});

test("areas follow the walk through the store, each split by category; the ones with no area come last", () => {
  const groups = groupByArea([
    { name: "Cumin", aisle: "", category: "Spices & seasonings" },
    { name: "Vinaigrette", aisle: HOMEMADE, category: "Sauces & condiments" },
    { name: "Apple", aisle: "", category: "Fruit" },
    { name: "Canned tomatoes", aisle: "5", category: "Vegetables" },
    { name: "Mustard", aisle: "4", category: "Sauces & condiments" },
    { name: "Pasta", aisle: "4", category: "Grains & bread" },
    { name: "Carrots", aisle: "", category: "Vegetables" },
    { name: "Milk", aisle: "", category: "Milks" },
  ]);
  assert.deepEqual(groups.map((g) => [g.area, g.count, g.groups.map((c) => `${c.category}: ${c.items.map((i) => i.name)}`)]), [
    ["4", 2, ["Grains & bread: Pasta", "Sauces & condiments: Mustard"]],
    ["5", 1, ["Vegetables: Canned tomatoes"]],
    ["Produce", 2, ["Fruit: Apple", "Vegetables: Carrots"]],
    ["Dairy & eggs", 1, ["Milks: Milk"]],
    [HOMEMADE, 1, ["Sauces & condiments: Vinaigrette"]],
    ["", 1, ["Spices & seasonings: Cumin"]],
  ]);
});
