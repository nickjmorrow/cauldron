import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";

const DB_PATH = process.env.CAULDRON_DB ?? "data/cauldron.db";
// Used to average old workout and rest targets when no profile says how many workout days there are.
const DEFAULT_WORKOUT_DAYS = 4;

// proposed = AI or import suggestion waiting for approval; approved counts toward totals.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS ingredients (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  serving TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT '',
  fdc_id INTEGER,
  notes TEXT NOT NULL DEFAULT '',
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
-- A day has one version per goal: the base day plus that version's adjustments.
CREATE TABLE IF NOT EXISTS day_versions (
  id INTEGER PRIMARY KEY,
  day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
  goal TEXT NOT NULL CHECK (goal IN ('cut','bulk')),
  status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved')),
  UNIQUE (day_id, goal)
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
  goal TEXT NOT NULL CHECK (goal IN ('cut','bulk')),
  nutrient TEXT NOT NULL,
  daily REAL,
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
CREATE TABLE IF NOT EXISTS staples (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('spice','baking')),
  UNIQUE (name, kind)
);
CREATE TABLE IF NOT EXISTS usda_cache (
  key TEXT PRIMARY KEY,
  body TEXT NOT NULL
);
`;

// Columns added after the first release; CREATE TABLE IF NOT EXISTS won't add them to an existing file.
// Days used to carry their own kind, goal and status; each old day becomes a day with one version.
// Version ids reuse the old day ids, so day_slots.day_id values carry straight over as version_id.
// Workout and rest days, and the maintain goal, used to be separate versions with their own targets. Now each goal has one
// version and one daily target: the workout version's changes are kept, rest and maintain versions go (with their
// suggestions), and a workout/rest pair of targets becomes their weekly average over the profile's workout days.
function mergeDayKinds(db: DatabaseSync) {
  if (!(db.prepare("PRAGMA table_info(day_versions)").all() as { name: string }[]).some((c) => c.name === "kind")) return;
  const profile = db.prepare("SELECT workout_days FROM profile WHERE id = 1").get() as { workout_days: number } | undefined;
  const workoutDays = profile?.workout_days ?? DEFAULT_WORKOUT_DAYS;
  const average = `ROUND((workout * ${workoutDays} + rest * ${7 - workoutDays}) / 7.0)`;
  db.exec("BEGIN");
  try {
    // With foreign keys on, these cascade to the versions' adjustments and suggestions.
    db.exec("DELETE FROM day_versions WHERE kind = 'rest' OR goal = 'maintain'");
    db.exec("DELETE FROM goal_targets WHERE goal = 'maintain'");
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  // Rebuilding a table someone references needs foreign keys off, or the drop would cascade.
  db.exec("PRAGMA foreign_keys = OFF");
  db.exec("BEGIN");
  try {
    db.exec(`CREATE TABLE day_versions_new (
      id INTEGER PRIMARY KEY,
      day_id INTEGER NOT NULL REFERENCES days(id) ON DELETE CASCADE,
      goal TEXT NOT NULL CHECK (goal IN ('cut','bulk')),
      status TEXT NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved')),
      UNIQUE (day_id, goal)
    )`);
    db.exec("INSERT INTO day_versions_new (id, day_id, goal, status) SELECT id, day_id, goal, status FROM day_versions");
    db.exec("DROP TABLE day_versions");
    db.exec("ALTER TABLE day_versions_new RENAME TO day_versions");
    db.exec(`CREATE TABLE goal_targets_new (goal TEXT NOT NULL CHECK (goal IN ('cut','bulk')), nutrient TEXT NOT NULL, daily REAL, PRIMARY KEY (goal, nutrient))`);
    db.exec(`INSERT INTO goal_targets_new (goal, nutrient, daily) SELECT goal, nutrient, ${average} FROM goal_targets`);
    db.exec("DROP TABLE goal_targets");
    db.exec("ALTER TABLE goal_targets_new RENAME TO goal_targets");
    db.exec(`UPDATE targets SET daily = ${average} WHERE daily IS NULL AND workout IS NOT NULL AND rest IS NOT NULL`);
    db.exec("ALTER TABLE targets DROP COLUMN workout");
    db.exec("ALTER TABLE targets DROP COLUMN rest");
    const broken = db.prepare("PRAGMA foreign_key_check").all();
    if (broken.length) throw new Error(`merging workout and rest days left ${broken.length} broken references`);
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
  mergeDayKinds(db);
  const proposals = db.prepare("PRAGMA table_info(proposals)").all() as { name: string }[];
  if (!proposals.some((c) => c.name === "base_adjustments")) db.exec("ALTER TABLE proposals ADD COLUMN base_adjustments TEXT NOT NULL DEFAULT '[]'");
  const profile = db.prepare("PRAGMA table_info(profile)").all() as { name: string }[];
  if (profile.some((c) => c.name === "activity")) db.exec("ALTER TABLE profile DROP COLUMN activity;");
  if (profile.some((c) => c.name === "goal")) db.exec("ALTER TABLE profile DROP COLUMN goal;");
  const ingredients = db.prepare("PRAGMA table_info(ingredients)").all() as { name: string }[];
  if (ingredients.some((c) => c.name === "contains_dairy")) db.exec("ALTER TABLE ingredients DROP COLUMN contains_dairy;");
  if (!ingredients.some((c) => c.name === "category")) db.exec("ALTER TABLE ingredients ADD COLUMN category TEXT NOT NULL DEFAULT '';");
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
