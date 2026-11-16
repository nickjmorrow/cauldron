import test from "node:test";
import assert from "node:assert/strict";
import { groupByCategory, UNCATEGORIZED } from "./categories.ts";

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
