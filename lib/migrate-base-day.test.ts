import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rmSync, mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

mkdirSync("data", { recursive: true });
const DB_URL = new URL("./db.ts", import.meta.url).href;
const FILE = "data/test-base-day.db";
const wipe = () => ["", "-wal", "-shm"].forEach((e) => rmSync(FILE + e, { force: true }));
test.before(wipe);
test.after(wipe);

function openWithApp(file: string) {
  const code = `process.env.CAULDRON_DB = ${JSON.stringify(file)}; const { getDb } = await import(${JSON.stringify(DB_URL)}); getDb();`;
  const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
}

// The shape just before the base day existed: every version owned its own slots.
// v1 workout-maintain is the biggest, v2 rest-maintain lacks Lunch 2 and has a turkey dinner variation, v3 bulk-rest is smaller still.
function versionsEra(file: string, opts: { part: boolean; data: "standard" | "planned" } = { part: true, data: "standard" }) {
  const db = new DatabaseSync(file);
  db.exec(`
    CREATE TABLE meals (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, typical_slot TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'proposed');
    CREATE TABLE days (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, notes TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE day_versions (
      id INTEGER PRIMARY KEY, day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('workout','rest')), goal TEXT NOT NULL CHECK (goal IN ('cut','maintain','bulk')),
      status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved')), UNIQUE (day_id, kind, goal)
    );
    CREATE TABLE day_slots (id INTEGER PRIMARY KEY, version_id INTEGER NOT NULL REFERENCES day_versions(id) ON DELETE CASCADE, name TEXT NOT NULL, position INTEGER NOT NULL);
    CREATE TABLE slot_options (
      id INTEGER PRIMARY KEY, slot_id INTEGER NOT NULL REFERENCES day_slots(id) ON DELETE CASCADE,
      meal_id INTEGER NOT NULL REFERENCES meals(id), is_planned INTEGER NOT NULL DEFAULT 0, ${opts.part ? "part INTEGER NOT NULL DEFAULT 0," : ""} UNIQUE (slot_id, meal_id)
    );
    INSERT INTO meals (id, name, status) VALUES (1,'Shake','approved'),(2,'Greens','approved'),(3,'Sandwich','approved'),(4,'Chicken','approved'),(5,'Salmon','approved'),(6,'Turkey','approved');
    INSERT INTO days (id, name, position) VALUES (1, 'Standard day', 1);
    INSERT INTO day_versions (id, day_id, kind, goal, status) VALUES (1,1,'workout','maintain','approved'),(2,1,'rest','maintain','approved')${opts.data === "standard" ? ",(3,1,'rest','bulk','approved')" : ""};
  `);
  let slotId = 0;
  const slot = (version: number, name: string, position: number, options: [number, number, number][]) => {
    slotId++;
    db.prepare("INSERT INTO day_slots (id, version_id, name, position) VALUES (?, ?, ?, ?)").run(slotId, version, name, position);
    for (const [meal, planned, part] of options) {
      if (opts.part) db.prepare("INSERT INTO slot_options (slot_id, meal_id, is_planned, part) VALUES (?, ?, ?, ?)").run(slotId, meal, planned, part);
      else db.prepare("INSERT INTO slot_options (slot_id, meal_id, is_planned) VALUES (?, ?, ?)").run(slotId, meal, planned);
    }
  };
  if (opts.data === "planned") {
    // The base version plans Chicken; the other plans a Turkey that only it has.
    slot(1, "Breakfast", 1, [[1, 1, 0]]); slot(1, "Dinner", 2, [[4, 1, 0]]);
    slot(2, "Dinner", 1, [[4, 0, 0], [6, 1, 0]]);
  } else {
    slot(1, "Breakfast", 1, [[1, 1, 0], [2, 1, 1]]); slot(1, "Lunch 2", 2, [[3, 1, 0]]); slot(1, "Dinner", 3, [[4, 1, 0], [5, 0, 0]]);
    slot(2, "Breakfast", 1, [[1, 1, 0], [2, 1, 1]]); slot(2, "Dinner", 2, [[5, 1, 0], [6, 0, 0]]);
    slot(3, "Breakfast", 1, [[1, 1, 0]]); slot(3, "Dinner", 2, [[4, 1, 0]]);
  }
  db.close();
}

const read = () => { const db = new DatabaseSync(FILE); db.exec("PRAGMA foreign_keys = ON"); return { db, q: (sql: string) => db.prepare(sql).all().map((r) => ({ ...r })) as Record<string, unknown>[] }; };

test("each version's slots fold into one base day, and what a version lacks becomes a remove", () => {
  versionsEra(FILE);
  openWithApp(FILE);
  const { db, q } = read();

  const slotColumns = q("PRAGMA table_info(day_slots)").map((c) => c.name);
  assert.ok(slotColumns.includes("day_id") && !slotColumns.includes("version_id"));
  assert.deepEqual(q("SELECT day_id, name, position FROM day_slots ORDER BY position").map((s) => [s.day_id, s.name]), [[1, "Breakfast"], [1, "Lunch 2"], [1, "Dinner"]]);

  const baseOptions = q(`SELECT s.name AS slot, m.name AS meal, o.part, o.is_planned AS planned FROM slot_options o
    JOIN day_slots s ON s.id = o.slot_id JOIN meals m ON m.id = o.meal_id ORDER BY s.position, o.part, o.id`);
  assert.deepEqual(baseOptions.map((o) => `${o.slot}/${o.meal}/${o.part}/${o.planned}`), [
    "Breakfast/Shake/0/1", "Breakfast/Greens/1/1", "Lunch 2/Sandwich/0/1", "Dinner/Chicken/0/1", "Dinner/Salmon/0/0", "Dinner/Turkey/0/0",
  ]);

  const removes = (version: number) => q(`SELECT s.name AS slot, m.name AS meal FROM version_adjustments a
    JOIN slot_options o ON o.id = a.option_id JOIN day_slots s ON s.id = o.slot_id JOIN meals m ON m.id = o.meal_id
    WHERE a.version_id = ${version} AND a.kind = 'remove' ORDER BY s.position, o.id`).map((r) => `${r.slot}/${r.meal}`);
  assert.deepEqual(removes(1), ["Dinner/Turkey"]); // turkey only exists in the rest version
  assert.deepEqual(removes(2), ["Lunch 2/Sandwich", "Dinner/Chicken"]);
  assert.deepEqual(removes(3), ["Breakfast/Greens", "Lunch 2/Sandwich", "Dinner/Salmon", "Dinner/Turkey"]);
  // Version 2 plans the salmon dinner while the base plans the chicken one, so it needs a plan adjustment; the others match the base.
  const plans = (version: number) => q(`SELECT s.name AS slot, m.name AS meal FROM version_adjustments a
    JOIN slot_options o ON o.id = a.option_id JOIN day_slots s ON s.id = o.slot_id JOIN meals m ON m.id = o.meal_id
    WHERE a.version_id = ${version} AND a.kind = 'plan'`).map((r) => `${r.slot}/${r.meal}`);
  assert.deepEqual([plans(1), plans(2), plans(3)], [[], ["Dinner/Salmon"], []]);
  assert.equal(q("SELECT COUNT(*) AS n FROM version_adjustments WHERE kind NOT IN ('remove', 'plan')")[0].n, 0);

  // Every version still eats exactly what it ate before.
  const eaten = (version: number) => {
    const gone = new Set(removes(version));
    return baseOptions.map((o) => `${o.slot}/${o.meal}`).filter((k) => !gone.has(k));
  };
  assert.deepEqual(eaten(1), ["Breakfast/Shake", "Breakfast/Greens", "Lunch 2/Sandwich", "Dinner/Chicken", "Dinner/Salmon"]);
  assert.deepEqual(eaten(2), ["Breakfast/Shake", "Breakfast/Greens", "Dinner/Salmon", "Dinner/Turkey"]);
  assert.deepEqual(eaten(3), ["Breakfast/Shake", "Dinner/Chicken"]);
  assert.deepEqual(q("PRAGMA foreign_key_check"), []);

  // Deleting a base meal removes the adjustments that pointed at it.
  db.prepare("DELETE FROM slot_options WHERE meal_id = 4").run();
  assert.deepEqual(removes(2), ["Lunch 2/Sandwich"]);
  db.close();
});

test("opening the converted file again changes nothing", () => {
  openWithApp(FILE);
  const { db, q } = read();
  assert.equal(q("SELECT COUNT(*) AS n FROM day_slots")[0].n, 3);
  assert.equal(q("SELECT COUNT(*) AS n FROM slot_options")[0].n, 5);
  db.close();
});

const PLANNED_FILE = "data/test-base-day-planned.db";
const PART_FILE = "data/test-base-day-nopart.db";
test.after(() => [PLANNED_FILE, PART_FILE].forEach((f) => ["", "-wal", "-shm"].forEach((e) => rmSync(f + e, { force: true }))));

test("a meal planned only in a later version stays unplanned in the base and gets a plan adjustment", () => {
  [PLANNED_FILE].forEach((f) => ["", "-wal", "-shm"].forEach((e) => rmSync(f + e, { force: true })));
  versionsEra(PLANNED_FILE, { part: true, data: "planned" });
  openWithApp(PLANNED_FILE);
  const db = new DatabaseSync(PLANNED_FILE);
  const q = (sql: string) => db.prepare(sql).all().map((r) => ({ ...r })) as Record<string, unknown>[];
  const planned = q(`SELECT m.name AS meal FROM slot_options o JOIN meals m ON m.id = o.meal_id JOIN day_slots s ON s.id = o.slot_id WHERE s.name = 'Dinner' AND o.is_planned = 1`).map((r) => r.meal);
  assert.deepEqual(planned, ["Chicken"], "the base part must have exactly one planned meal");
  const plans = q(`SELECT a.version_id, m.name AS meal FROM version_adjustments a JOIN slot_options o ON o.id = a.option_id JOIN meals m ON m.id = o.meal_id WHERE a.kind = 'plan'`).map((r) => `${r.version_id}/${r.meal}`);
  assert.deepEqual(plans, ["2/Turkey"]);
  db.close();
});

test("a file from before slot_options had a part column still opens", () => {
  [PART_FILE].forEach((f) => ["", "-wal", "-shm"].forEach((e) => rmSync(f + e, { force: true })));
  versionsEra(PART_FILE, { part: false, data: "standard" });
  openWithApp(PART_FILE);
  const db = new DatabaseSync(PART_FILE);
  assert.ok((db.prepare("PRAGMA table_info(slot_options)").all() as { name: string }[]).some((c) => c.name === "part"));
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM slot_options WHERE part != 0").get() as { n: number }).n, 0);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM day_slots").get() as { n: number }).n, 3);
  db.close();
});
