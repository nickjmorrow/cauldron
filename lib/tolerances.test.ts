import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

// Own database file, so the real one is never touched.
const FILE = "data/test-tolerances.db";
process.env.CAULDRON_DB = FILE;
const { getDb } = await import("./db.ts");
const { listTolerances, setTolerance } = await import("./tolerances.ts");

test.after(() => { for (const ext of ["", "-wal", "-shm"]) rmSync(FILE + ext, { force: true }); });

const db = getDb();
db.prepare("INSERT INTO targets (nutrient, workout, rest, daily, type) VALUES ('protein', 120, 90, NULL, NULL), ('sodium', NULL, NULL, 2300, 'no_more_than'), ('fiber', NULL, NULL, 28, 'at_least')").run();
db.prepare("INSERT INTO profile (id, age, sex, height_cm, weight_kg, workout_days) VALUES (1, 40, 'male', 175, 80, 4)").run();

test("a nutrient can be marked okay to exceed, with an optional limit, and turned off again", () => {
  assert.equal(setTolerance("protein", true, 150), null);
  assert.deepEqual(listTolerances().protein, { okToExceed: true, upTo: 150 });
  assert.equal(setTolerance("fiber", true, null), null);
  assert.deepEqual(listTolerances().fiber, { okToExceed: true, upTo: null });
  assert.equal(setTolerance("protein", false, null), null);
  assert.equal(listTolerances().protein, undefined);
});

test("an upper-limit nutrient cannot be marked okay to exceed", () => {
  assert.match(setTolerance("sodium", true, null)!, /upper limit/);
  assert.equal(listTolerances().sodium, undefined);
});

test("the limit cannot pass the health ceiling for the profile's weight", () => {
  assert.match(setTolerance("protein", true, 177)!, /176/); // 80 kg x 2.2
  assert.equal(setTolerance("protein", true, 176), null);
  assert.equal(listTolerances().protein!.upTo, 176);
});

test("a nutrient with no target cannot be marked", () => {
  assert.match(setTolerance("zinc", true, null)!, /no target/);
});
