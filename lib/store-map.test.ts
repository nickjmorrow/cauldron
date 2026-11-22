import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

process.env.CAULDRON_DB = "data/test-store-map.db";
rmSync("data/test-store-map.db", { force: true });
const { getStoreMap, storeMapText, setAisleContents, getAisleContents } = await import("./store-map.ts");
const { addItem, finishLookup, groupItems, listItems } = await import("./shopping.ts");

test("the map lists the items known to be in each numbered aisle, in aisle order", () => {
  addItem({ name: "Sesame seeds", aisle: "4" });
  addItem({ name: "Broth", aisle: "9" });
  addItem({ name: "Kale", aisle: "Produce" }); // a department, not a numbered aisle
  const placed = addItem({ name: "Tomato paste" }, { lookUp: true });
  finishLookup(placed.id, "9");
  addItem({ name: "Mystery" }); // only a guess: not on the map
  assert.deepEqual(getStoreMap(), [{ aisle: "4", holds: "", items: ["Sesame seeds"] }, { aisle: "9", holds: "", items: ["Broth", "Tomato paste"] }]);
  assert.equal(storeMapText(), "Aisle 4: Sesame seeds\nAisle 9: Broth, Tomato paste");
});

test("what an aisle holds is shown on the map, in the prompt and next to the aisle's heading", () => {
  setAisleContents("9", "Canned goods, soup");
  setAisleContents("2", "Cleaning");
  assert.deepEqual(getStoreMap().map((e) => [e.aisle, e.holds]), [["2", "Cleaning"], ["4", ""], ["9", "Canned goods, soup"]]);
  assert.equal(storeMapText(), "Aisle 2 (Cleaning): no items yet\nAisle 4: Sesame seeds\nAisle 9 (Canned goods, soup): Broth, Tomato paste");
  const groups = groupItems(listItems()).groups;
  assert.equal(groups.find((g) => g.title === "Aisle 9")?.holds, "Canned goods, soup");
  assert.equal(groups.find((g) => g.title === "Produce")?.holds, "");
  setAisleContents("2", "");
  assert.deepEqual(getAisleContents(), { "9": "Canned goods, soup" });
  rmSync("data/test-store-map.db", { force: true });
});
