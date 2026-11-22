import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

process.env.CAULDRON_DB = "data/test-store-map.db";
rmSync("data/test-store-map.db", { force: true });
const { readStoreMap, saveStoreMap, getStoreMap, storeMapText } = await import("./store-map.ts");
const { addItem, getItem } = await import("./shopping.ts");
const { rebuildStoreMap, storeMapBuilding } = await import("./aisles.ts");

test("the research answer is read from its last JSON, keeping only numbered aisles with contents", () => {
  const text = 'Found these.\n{"aisles": [{"aisle": "Aisle 09", "holds": ["canned soup", " broth "]}, {"aisle": "Produce", "holds": ["kale"]}, {"aisle": "3", "holds": []}]}';
  assert.deepEqual(readStoreMap(text), [{ aisle: "9", holds: ["canned soup", "broth"] }]);
  assert.equal(readStoreMap("no json"), undefined);
});

test("the map joins the researched aisles with the items you've placed, in aisle order", () => {
  saveStoreMap([{ aisle: "9", holds: ["canned soup", "broth"] }, { aisle: "4", holds: ["Asian foods"] }]);
  addItem({ name: "Sesame seeds", aisle: "4" });
  addItem({ name: "Mystery thing", aisle: "Produce" }); // a department, not a numbered aisle: not on the map
  assert.deepEqual(getStoreMap(), [
    { aisle: "4", holds: ["Asian foods"], items: ["Sesame seeds"] },
    { aisle: "9", holds: ["canned soup", "broth"], items: [] },
  ]);
  assert.equal(storeMapText(), "Aisle 4: Asian foods (on the list before: Sesame seeds)\nAisle 9: canned soup, broth");
});

test("rebuilding researches the map, saves it, then places the items that only had a guess", async () => {
  const item = addItem({ name: "Tomato paste" }, { lookUp: false });
  let seenMap = "";
  assert.equal(rebuildStoreMap(async () => [{ aisle: "7", holds: ["canned tomatoes and tomato paste"] }], async (_n, _s, map) => { seenMap = map; return "7"; }), true);
  assert.equal(rebuildStoreMap(async () => undefined), false); // one run at a time
  while (storeMapBuilding()) await new Promise((r) => setTimeout(r, 5));
  await new Promise((r) => setTimeout(r, 20));
  assert.match(seenMap, /Aisle 7: canned tomatoes and tomato paste/);
  assert.equal(getItem(item.id)!.aisle, "7");
  rmSync("data/test-store-map.db", { force: true });
});
