import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";

const DB_PATH = process.env.CAULDRON_DB ?? "data/cauldron.db";

// proposed = AI or import suggestion waiting for approval; approved counts toward totals.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS ingredients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  serving TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  fdc_id INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  contains_dairy INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved')),
  nutrients TEXT NOT NULL DEFAULT '{}'
);
CREATE TABLE IF NOT EXISTS meals (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  typical_slot TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved'))
);
CREATE TABLE IF NOT EXISTS meal_items (
  meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  qty REAL NOT NULL,
  PRIMARY KEY (meal_id, ingredient_id)
);
CREATE TABLE IF NOT EXISTS days (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  notes TEXT NOT NULL DEFAULT '',
  position INTEGER NOT NULL DEFAULT 0
);
-- A day holds up to six versions: workout or rest, for each goal. Each has its own slots.
CREATE TABLE IF NOT EXISTS day_versions (
  id INTEGER PRIMARY KEY,
  day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('workout','rest')),
  goal TEXT NOT NULL CHECK (goal IN ('cut','maintain','bulk')),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved')),
  UNIQUE (day_id, kind, goal)
);
-- The base day: slots and meals every version starts from. Meals in a slot are variations (same part) or eaten together (different parts).
CREATE TABLE IF NOT EXISTS day_slots (
  id INTEGER PRIMARY KEY,
  day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  position INTEGER NOT NULL
);
-- One option = a recurring meal; several = variations. Exactly one is planned.
CREATE TABLE IF NOT EXISTS slot_options (
  id INTEGER PRIMARY KEY,
  slot_id INTEGER NOT NULL REFERENCES day_slots(id) ON DELETE CASCADE,
  meal_id INTEGER NOT NULL REFERENCES meals(id),
  is_planned INTEGER NOT NULL DEFAULT 0,
  UNIQUE (slot_id, meal_id)
);
-- A version is the base day plus these: drop a base meal, scale one, pick the planned variation, or add a food (an ingredient or a meal) to a slot.
CREATE TABLE IF NOT EXISTS version_adjustments (
  id INTEGER PRIMARY KEY,
  version_id INTEGER NOT NULL REFERENCES day_versions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('remove','scale','plan','add')),
  option_id INTEGER REFERENCES slot_options(id) ON DELETE CASCADE,
  slot_id INTEGER REFERENCES day_slots(id) ON DELETE CASCADE,
  meal_id INTEGER REFERENCES meals(id) ON DELETE CASCADE,
  ingredient_id INTEGER REFERENCES ingredients(id) ON DELETE CASCADE,
  qty REAL,
  factor REAL,
  UNIQUE (version_id, kind, option_id),
  CHECK (
    (kind IN ('remove','plan') AND option_id IS NOT NULL) OR
    (kind = 'scale' AND option_id IS NOT NULL AND factor IS NOT NULL) OR
    (kind = 'add' AND slot_id IS NOT NULL AND qty IS NOT NULL AND ((meal_id IS NULL) != (ingredient_id IS NULL)))
  )
);
-- Foods the user confirmed they like, per kind of meal; the pool fixes and generation add from.
CREATE TABLE IF NOT EXISTS liked_foods (
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  slot_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('proposed','approved')),
  PRIMARY KEY (ingredient_id, slot_name)
);
-- "It's okay to exceed this": allowed only within the health ceiling, see lib/guardrails.ts.
CREATE TABLE IF NOT EXISTS tolerances (
  nutrient TEXT PRIMARY KEY,
  ok_to_exceed INTEGER NOT NULL DEFAULT 1,
  up_to REAL
);
-- Suggested changes to a version, waiting for review. Accepting applies the stored adjustments.
CREATE TABLE IF NOT EXISTS proposals (
  id INTEGER PRIMARY KEY,
  version_id INTEGER NOT NULL REFERENCES day_versions(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('fix','generate')),
  adjustments TEXT NOT NULL,
  totals_before TEXT NOT NULL,
  totals_after TEXT NOT NULL,
  base_adjustments TEXT NOT NULL DEFAULT '[]', -- the version's adjustments when this was suggested; accepting is refused if they have changed since
  note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','dismissed')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS targets (
  nutrient TEXT PRIMARY KEY,
  workout REAL,
  rest REAL,
  daily REAL,
  type TEXT CHECK (type IN ('at_least','no_more_than'))
);
-- One row: the body stats and goal the calorie and macro calculators run on.
CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  age INTEGER NOT NULL,
  sex TEXT NOT NULL CHECK (sex IN ('male','female')),
  height_cm REAL NOT NULL,
  weight_kg REAL NOT NULL,
  workout_days INTEGER NOT NULL
);
-- Calories, carbs, protein and fat for each goal; every other target is shared and lives in targets.
CREATE TABLE IF NOT EXISTS goal_targets (
  goal TEXT NOT NULL CHECK (goal IN ('cut','maintain','bulk')),
  nutrient TEXT NOT NULL,
  workout REAL,
  rest REAL,
  PRIMARY KEY (goal, nutrient)
);
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY,
  parent_id INTEGER REFERENCES locations(id) ON DELETE CASCADE,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ingredient_locations (
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
  location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
  PRIMARY KEY (ingredient_id, location_id)
);
CREATE TABLE IF NOT EXISTS usda_cache (
  key TEXT PRIMARY KEY,
  body TEXT NOT NULL
);
`;

// Columns added after the first release; CREATE TABLE IF NOT EXISTS won't add them to an existing file.
// Days used to carry their own kind, goal and status; each old day becomes a day with one version.
// Version ids reuse the old day ids, so day_slots.day_id values carry straight over as version_id.
function moveDaysToVersions(db: DatabaseSync) {
  const days = db.prepare("PRAGMA table_info(days)").all() as { name: string }[];
  if (!days.some((c) => c.name === "kind")) return;
  // Days made before goals existed were all built for a cut.
  if (!days.some((c) => c.name === "goal")) {
    db.exec("ALTER TABLE days ADD COLUMN goal TEXT NOT NULL DEFAULT 'cut' CHECK (goal IN ('cut','maintain','bulk'));");
  }
  const count = (table: string) => (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
  // Foreign keys stay off while day_slots is rebuilt, or dropping it would cascade into slot_options.
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    db.exec("INSERT INTO day_versions (id, day_id, kind, goal, status) SELECT id, id, kind, goal, status FROM days");
    db.exec(`CREATE TABLE day_slots_new (
      id INTEGER PRIMARY KEY,
      version_id INTEGER NOT NULL REFERENCES day_versions(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      position INTEGER NOT NULL
    )`);
    db.exec("INSERT INTO day_slots_new (id, version_id, name, position) SELECT id, day_id, name, position FROM day_slots");
    if (count("day_slots_new") !== count("day_slots")) throw new Error("day_slots row count changed while moving days to versions");
    db.exec("DROP TABLE day_slots");
    db.exec("ALTER TABLE day_slots_new RENAME TO day_slots");
    for (const column of ["kind", "goal", "status"]) db.exec(`ALTER TABLE days DROP COLUMN ${column}`);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

// Versions used to own their slots. The base day is now the union of them, and each version drops what it lacked.
// The biggest version (maintain and workout on a tie) sets the order and the planned meals; a version that plans another meal gets a plan adjustment. A meal keeps the part it was first seen in.
function moveSlotsToBaseDay(db: DatabaseSync) {
  if (!(db.prepare("PRAGMA table_info(day_slots)").all() as { name: string }[]).some((c) => c.name === "version_id")) return;
  type OldSlot = { id: number; version_id: number; name: string; position: number };
  type OldOption = { slot_id: number; meal_id: number; is_planned: number; part: number };
  const versions = db.prepare("SELECT id, day_id, kind, goal FROM day_versions ORDER BY id").all() as { id: number; day_id: number; kind: string; goal: string }[];
  const slots = db.prepare("SELECT id, version_id, name, position FROM day_slots ORDER BY position, id").all() as OldSlot[];
  const options = db.prepare("SELECT slot_id, meal_id, is_planned, part FROM slot_options ORDER BY id").all() as OldOption[];
  const optionsOf = (slotId: number) => options.filter((o) => o.slot_id === slotId);
  const slotsOf = (versionId: number) => slots.filter((s) => s.version_id === versionId);
  const size = (versionId: number) => slotsOf(versionId).reduce((n, s) => n + optionsOf(s.id).length, 0);

  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    db.exec("CREATE TABLE day_slots_new (id INTEGER PRIMARY KEY, day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE, name TEXT NOT NULL, position INTEGER NOT NULL)");
    db.exec(`CREATE TABLE slot_options_new (
      id INTEGER PRIMARY KEY,
      slot_id INTEGER NOT NULL REFERENCES day_slots(id) ON DELETE CASCADE,
      meal_id INTEGER NOT NULL REFERENCES meals(id),
      is_planned INTEGER NOT NULL DEFAULT 0,
      part INTEGER NOT NULL DEFAULT 0,
      UNIQUE (slot_id, meal_id)
    )`);
    const insertSlot = db.prepare("INSERT INTO day_slots_new (day_id, name, position) VALUES (?, ?, ?)");
    const insertOption = db.prepare("INSERT INTO slot_options_new (slot_id, meal_id, is_planned, part) VALUES (?, ?, ?, ?)");
    const insertRemove = db.prepare("INSERT INTO version_adjustments (version_id, kind, option_id) VALUES (?, 'remove', ?)");
    const insertPlan = db.prepare("INSERT INTO version_adjustments (version_id, kind, option_id) VALUES (?, 'plan', ?)");

    for (const dayId of [...new Set(versions.map((v) => v.day_id))]) {
      const mine = versions.filter((v) => v.day_id === dayId);
      const base = [...mine].sort((a, b) => size(b.id) - size(a.id)
        || Number(b.goal === "maintain" && b.kind === "workout") - Number(a.goal === "maintain" && a.kind === "workout") || a.id - b.id)[0];
      const ordered = [base, ...mine.filter((v) => v.id !== base.id)];

      const plannedParts = new Set<string>(); // slot name + part that already has a planned meal in the base
      const baseSlots = new Map<string, { id: number; options: Map<number, { id: number; planned: number }> }>(); // slot name -> new slot id; meal id -> new option id and planned flag
      for (const version of ordered) {
        for (const slot of slotsOf(version.id)) {
          let target = baseSlots.get(slot.name);
          if (!target) {
            target = { id: Number(insertSlot.run(dayId, slot.name, baseSlots.size + 1).lastInsertRowid), options: new Map() };
            baseSlots.set(slot.name, target);
          }
          for (const o of optionsOf(slot.id)) {
            if (target.options.has(o.meal_id)) continue;
            // A part has one planned meal in the base; a version that plans another gets a plan adjustment below.
            const partKey = `${slot.name}\u0000${o.part}`;
            const planned = o.is_planned && !plannedParts.has(partKey) ? 1 : 0;
            if (planned) plannedParts.add(partKey);
            target.options.set(o.meal_id, { id: Number(insertOption.run(target.id, o.meal_id, planned, o.part).lastInsertRowid), planned });
          }
        }
      }
      const baseCount = [...baseSlots.values()].reduce((n, s) => n + s.options.size, 0);

      for (const version of mine) {
        const had = new Set(slotsOf(version.id).flatMap((s) => optionsOf(s.id).map((o) => `${s.name}\u0000${o.meal_id}`)));
        const planned = new Set(slotsOf(version.id).flatMap((s) => optionsOf(s.id).filter((o) => o.is_planned).map((o) => `${s.name}\u0000${o.meal_id}`)));
        let removed = 0;
        for (const [name, slot] of baseSlots) {
          for (const [mealId, option] of slot.options) {
            const key = `${name}\u0000${mealId}`;
            if (!had.has(key)) { insertRemove.run(version.id, option.id); removed++; }
            else if (planned.has(key) && !option.planned) insertPlan.run(version.id, option.id); // this version plans a meal the base does not
          }
        }
        if (baseCount - removed !== had.size) throw new Error(`version ${version.id} would eat ${baseCount - removed} meals after the move, but ate ${had.size} before`);
      }
    }
    db.exec("DROP TABLE slot_options");
    db.exec("DROP TABLE day_slots");
    db.exec("ALTER TABLE day_slots_new RENAME TO day_slots");
    db.exec("ALTER TABLE slot_options_new RENAME TO slot_options");
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  } finally {
    db.exec("PRAGMA foreign_keys = ON");
  }
}

function migrate(db: DatabaseSync) {
  const columns = db.prepare("PRAGMA table_info(locations)").all() as { name: string }[];
  if (!columns.some((c) => c.name === "position")) {
    db.exec("ALTER TABLE locations ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE locations SET position = id;");
  }
  const days = db.prepare("PRAGMA table_info(days)").all() as { name: string }[];
  if (!days.some((c) => c.name === "position")) {
    db.exec("ALTER TABLE days ADD COLUMN position INTEGER NOT NULL DEFAULT 0; UPDATE days SET position = id;");
  }
  // Added before the slot moves below, which read it. Options in the same part of a slot are variations; different parts are eaten together.
  const options = db.prepare("PRAGMA table_info(slot_options)").all() as { name: string }[];
  if (!options.some((c) => c.name === "part")) {
    db.exec("ALTER TABLE slot_options ADD COLUMN part INTEGER NOT NULL DEFAULT 0;");
  }
  moveDaysToVersions(db);
  moveSlotsToBaseDay(db);
  const proposals = db.prepare("PRAGMA table_info(proposals)").all() as { name: string }[];
  if (!proposals.some((c) => c.name === "base_adjustments")) db.exec("ALTER TABLE proposals ADD COLUMN base_adjustments TEXT NOT NULL DEFAULT '[]'");
  const profile = db.prepare("PRAGMA table_info(profile)").all() as { name: string }[];
  if (profile.some((c) => c.name === "activity")) db.exec("ALTER TABLE profile DROP COLUMN activity;");
  if (profile.some((c) => c.name === "goal")) db.exec("ALTER TABLE profile DROP COLUMN goal;");
  const placements = db.prepare("PRAGMA table_info(ingredient_locations)").all() as { name: string }[];
  if (!placements.some((c) => c.name === "status")) {
    db.exec("ALTER TABLE ingredient_locations ADD COLUMN status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('proposed','approved'));");
  }
}

let db: DatabaseSync | undefined;

export function getDb(): DatabaseSync {
  if (db) return db;
  mkdirSync("data", { recursive: true });
  const opened = new DatabaseSync(DB_PATH);
  try {
    opened.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    opened.exec(SCHEMA);
    migrate(opened);
  } catch (e) {
    opened.close(); // not cached, so the next call retries instead of serving a half-migrated file
    throw e;
  }
  db = opened;
  return db;
}
