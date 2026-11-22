import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

process.env.CAULDRON_DB = "data/test-aisles.db";
rmSync("data/test-aisles.db", { force: true });
const { readAisle, lookUp, lookUpGuessed } = await import("./aisles.ts");
const { addItem, getItem } = await import("./shopping.ts");

test("the answer is read from the last JSON line, as an aisle number or a known section", () => {
  assert.equal(readAisle('It is in aisle 12 at that store.\n{"aisle": "12"}'), "12");
  assert.equal(readAisle('{"aisle": "Aisle 07"}'), "7");
  assert.equal(readAisle('Usually produce.\n{"aisle": "produce"}'), "Produce");
  assert.equal(readAisle('{"aisle": "Somewhere near the back"}'), undefined);
  assert.equal(readAisle("no json here"), undefined);
  assert.equal(readAisle(`{"aisle": "unknown"}`), undefined);
  assert.equal(readAisle(`{"aisle": "Pantry"}`), undefined); // not a real area
});

test("a lookup stores what Claude found, and a failure keeps the guess", async () => {
  const found = addItem({ name: "Gochujang" }, { lookUp: true });
  await lookUp(found.id, found.name, async (name, store) => (name === "Gochujang" && store ? "14" : undefined));
  assert.equal(getItem(found.id)!.aisle, "14");
  assert.equal(getItem(found.id)!.aisleFrom, "store");

  const failed = addItem({ name: "Celery root" }, { lookUp: true });
  await lookUp(failed.id, failed.name, async () => { throw new Error("offline"); });
  assert.equal(getItem(failed.id)!.aisle, "Produce");
  assert.equal(getItem(failed.id)!.looking, false);
});

test("looking up the guessed items leaves alone the ones with a known aisle", async () => {
  const asked: string[] = [];
  const started = lookUpGuessed(async (name) => { asked.push(name); return "5"; });
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(started, 1);
  assert.deepEqual(asked, ["Celery root"]);
  rmSync("data/test-aisles.db", { force: true });
});
