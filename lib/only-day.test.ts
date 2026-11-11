import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

// Own database file, so the real one is never touched.
const FILE = "data/test-only-day.db";
process.env.CAULDRON_DB = FILE;
const { getDb } = await import("./db.ts");
const { getOnlyDay } = await import("./queries.ts");

test.after(() => { for (const ext of ["", "-wal", "-shm"]) rmSync(FILE + ext, { force: true }); });

const db = getDb();
const dayCount = () => (db.prepare("SELECT COUNT(*) AS n FROM days").get() as { n: number }).n;

test("a database with no day gets exactly one, and asking again returns the same one", () => {
  assert.equal(dayCount(), 0);
  const first = getOnlyDay();
  assert.equal(dayCount(), 1);
  assert.deepEqual(first.versions, []);
  assert.equal(getOnlyDay().id, first.id);
  assert.equal(dayCount(), 1);
});

test("with several days already there, the first by position is the one", () => {
  db.prepare("INSERT INTO days (name, position) VALUES ('Later day', 9), ('Earlier day', 0)").run();
  assert.equal(getOnlyDay().name, "Earlier day");
});
