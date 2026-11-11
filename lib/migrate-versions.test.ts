import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rmSync, mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

mkdirSync("data", { recursive: true });
const DB_URL = new URL("./db.ts", import.meta.url).href;
const FILES = ["data/test-migrate.db", "data/test-migrate-nogoal.db", "data/test-fresh.db", "data/test-migrate-fail.db"];
const wipe = () => FILES.forEach((f) => ["", "-wal", "-shm"].forEach((e) => rmSync(f + e, { force: true })));
test.before(wipe);
test.after(wipe);

// Opening through getDb() in a child process runs the schema and migrate() on that file only.
function openWithApp(file: string) {
  const code = `process.env.CAULDRON_DB = ${JSON.stringify(file)}; const { getDb } = await import(${JSON.stringify(DB_URL)}); getDb();`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
}

// The shape before versions existed (days carried kind, goal and status; slots carried day_id).
function oldShape(file: string, withGoal: boolean) {
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE meals (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, typical_slot TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'proposed');
    CREATE TABLE days (
      id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL DEFAULT 'workout' CHECK (kind IN ('workout','rest')),
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved')),
      position INTEGER NOT NULL DEFAULT 0
      ${withGoal ? ", goal TEXT NOT NULL DEFAULT 'cut' CHECK (goal IN ('cut','maintain','bulk'))" : ""}
    );
    CREATE TABLE day_slots (id INTEGER PRIMARY KEY, day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE, name TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE slot_options (
      id INTEGER PRIMARY KEY, slot_id INTEGER NOT NULL REFERENCES day_slots(id) ON DELETE CASCADE,
      meal_id INTEGER NOT NULL REFERENCES meals(id), is_planned INTEGER NOT NULL DEFAULT 0, part INTEGER NOT NULL DEFAULT 0,
      UNIQUE (slot_id, meal_id)
    );
    INSERT INTO meals (id, name) VALUES (1, 'Shake'), (2, 'Salmon');
    INSERT INTO days (id, name, kind, status, position) VALUES (1, 'Workout Day', 'workout', 'approved', 1), (2, 'Rest Day (bulk)', 'rest', 'proposed', 2);
    ${withGoal ? "UPDATE days SET goal = 'bulk' WHERE id = 2;" : ""}
    INSERT INTO day_slots (id, day_id, name, position) VALUES (1, 1, 'Breakfast', 1), (2, 1, 'Dinner', 2), (3, 2, 'Breakfast', 1);
    INSERT INTO slot_options (slot_id, meal_id, is_planned, part) VALUES (1, 1, 1, 0), (2, 1, 1, 0), (3, 2, 1, 0);
  `);
  db.close();
}

const read = (file: string) => {
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON");
  const q = (sql: string) => db.prepare(sql).all() as Record<string, unknown>[];
  return { db, q };
};

test("old days become days with one version each, and their slots end up on the day", () => {
  oldShape("data/test-migrate.db", true);
  openWithApp("data/test-migrate.db");
  const { db, q } = read("data/test-migrate.db");

  const dayColumns = q("PRAGMA table_info(days)").map((c) => c.name);
  for (const gone of ["kind", "goal", "status"]) assert.ok(!dayColumns.includes(gone), `days still has ${gone}`);
  assert.deepEqual(q("SELECT id, name FROM days ORDER BY id").map((d) => d.name), ["Workout Day", "Rest Day (bulk)"]);

  assert.deepEqual(q("SELECT id, day_id, kind, goal, status FROM day_versions ORDER BY id").map((v) => ({ ...v })), [
    { id: 1, day_id: 1, kind: "workout", goal: "cut", status: "approved" },
    { id: 2, day_id: 2, kind: "rest", goal: "bulk", status: "proposed" },
  ]);
  assert.deepEqual(q("SELECT day_id, name FROM day_slots ORDER BY day_id, position").map((s) => ({ ...s })), [
    { day_id: 1, name: "Breakfast" },
    { day_id: 1, name: "Dinner" },
    { day_id: 2, name: "Breakfast" },
  ]);
  assert.equal(q("SELECT COUNT(*) AS n FROM slot_options")[0].n, 3);
  assert.equal(q("SELECT COUNT(*) AS n FROM slot_options o JOIN day_slots s ON s.id = o.slot_id")[0].n, 3);
  assert.deepEqual(q("PRAGMA foreign_key_check"), []);

  // The cascade still reaches versions, slots and options through the day.
  db.prepare("DELETE FROM days WHERE id = 1").run();
  assert.equal(q("SELECT COUNT(*) AS n FROM day_versions")[0].n, 1);
  assert.equal(q("SELECT COUNT(*) AS n FROM day_slots")[0].n, 1);
  assert.equal(q("SELECT COUNT(*) AS n FROM slot_options")[0].n, 1);
  db.close();
});

test("opening the migrated file again changes nothing", () => {
  openWithApp("data/test-migrate.db");
  const { db, q } = read("data/test-migrate.db");
  assert.equal(q("SELECT COUNT(*) AS n FROM day_versions")[0].n, 1); // the delete above stuck; no rows reappeared
  assert.equal(q("SELECT COUNT(*) AS n FROM days")[0].n, 1);
  db.close();
});

test("a database from before goals existed gets cut versions", () => {
  oldShape("data/test-migrate-nogoal.db", false);
  openWithApp("data/test-migrate-nogoal.db");
  const { db, q } = read("data/test-migrate-nogoal.db");
  assert.deepEqual(q("SELECT kind, goal FROM day_versions ORDER BY id").map((v) => ({ ...v })), [
    { kind: "workout", goal: "cut" },
    { kind: "rest", goal: "cut" },
  ]);
  db.close();
});

test("a fresh database starts in the new shape and never gains days.goal", () => {
  openWithApp("data/test-fresh.db");
  const { db, q } = read("data/test-fresh.db");
  assert.deepEqual(q("PRAGMA table_info(days)").map((c) => c.name).sort(), ["id", "name", "notes", "position"]);
  assert.ok(q("PRAGMA table_info(day_slots)").some((c) => c.name === "day_id"));
  assert.ok(q("PRAGMA table_info(day_versions)").length > 0);
  db.close();
});

test("a migration that fails leaves the file alone and every later open fails too", () => {
  // An old-shape file whose day has a kind the new table refuses, so the migration throws partway.
  const bad = new DatabaseSync("data/test-migrate-fail.db");
  bad.exec(`
    CREATE TABLE days (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, kind TEXT NOT NULL, notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'approved', position INTEGER NOT NULL DEFAULT 0, goal TEXT NOT NULL DEFAULT 'cut');
    CREATE TABLE day_slots (id INTEGER PRIMARY KEY, day_id INTEGER NOT NULL, name TEXT NOT NULL, position INTEGER NOT NULL);
    INSERT INTO days (id, name, kind) VALUES (1, 'Odd day', 'brunch');
  `);
  bad.close();
  const code = `process.env.CAULDRON_DB = "data/test-migrate-fail.db"; const { getDb } = await import(${JSON.stringify(DB_URL)});
    const results = []; for (let i = 0; i < 2; i++) { try { getDb(); results.push("opened"); } catch { results.push("threw"); } } console.log(results.join(","));`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
  assert.equal(r.stdout.trim(), "threw,threw", r.stderr);
  const { db, q } = read("data/test-migrate-fail.db");
  assert.ok(q("PRAGMA table_info(days)").some((c) => c.name === "kind"), "the failed migration must roll back");
  assert.equal(q("SELECT COUNT(*) AS n FROM day_versions")[0].n, 0);
  db.close();
});
