import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

process.env.CAULDRON_DB = "data/test-store-map.db";
rmSync("data/test-store-map.db", { force: true });
const { getStoreMap, storeMapText } = await import("./store-map.ts");
const { addItem, finishLookup } = await import("./shopping.ts");

test("the map lists the items known to be in each numbered aisle, in aisle order", () => {
  addItem({ name: "Sesame seeds", aisle: "4" });
  addItem({ name: "Broth", aisle: "9" });
  addItem({ name: "Kale", aisle: "Produce" }); // a department, not a numbered aisle
  const placed = addItem({ name: "Tomato paste" }, { lookUp: true });
  finishLookup(placed.id, "9");
  addItem({ name: "Mystery" }); // only a guess: not on the map
  assert.deepEqual(getStoreMap(), [{ aisle: "4", items: ["Sesame seeds"] }, { aisle: "9", items: ["Broth", "Tomato paste"] }]);
  assert.equal(storeMapText(), "Aisle 4: Sesame seeds\nAisle 9: Broth, Tomato paste");
  rmSync("data/test-store-map.db", { force: true });
});
