import { getDb } from "./db.ts";
import { mealTotals, dayTotals, type Target } from "./compute.ts";
import type { Nutrients } from "./nutrients.ts";
import { goalTargetRows, type Goal, type Profile } from "./calculators.ts";
import type { DayKind, VersionKey } from "./versions.ts";
import { chosenOptions, partKey } from "./chosen.ts";
import { resolveVersion, type Adjustment, type OptionAdjust } from "./resolve.ts";

export type Status = "proposed" | "approved";
export type Ingredient = {
  id: number; name: string; serving: string; source: string; fdc_id: number | null;
  notes: string; contains_dairy: boolean; status: Status; nutrients: Nutrients;
};
export type Meal = { id: number; name: string; typical_slot: string; source: string; notes: string; status: Status };
export type MealWithTotals = Meal & { totals: Nutrients; items: { ingredient: Ingredient; qty: number }[] };

type Row = Record<string, unknown>;
const toIngredient = (r: Row): Ingredient => ({
  ...(r as unknown as Ingredient),
  contains_dairy: !!r.contains_dairy,
  nutrients: JSON.parse(r.nutrients as string),
});

// Meals imported without a breakdown are stored as one "1 meal" ingredient so their totals count.
// They are plumbing, not ingredients, so lists of ingredients leave them out.
export const STUB_SERVING = "1 meal";

export function listIngredients(status?: Status): Ingredient[] {
  const rows = status
    ? getDb().prepare("SELECT * FROM ingredients WHERE status = ? ORDER BY name").all(status)
    : getDb().prepare("SELECT * FROM ingredients ORDER BY name").all();
  return rows.map(toIngredient).filter((i) => i.serving !== STUB_SERVING);
}

export function getMeal(id: number): MealWithTotals | undefined {
  const db = getDb();
  const meal = db.prepare("SELECT * FROM meals WHERE id = ?").get(id) as unknown as Meal | undefined;
  if (!meal) return undefined;
  const rows = db.prepare(
    "SELECT i.*, mi.qty AS qty FROM meal_items mi JOIN ingredients i ON i.id = mi.ingredient_id WHERE mi.meal_id = ? ORDER BY i.name",
  ).all(id);
  const items = rows.map((r) => ({ ingredient: toIngredient(r), qty: r.qty as number }));
  // Only approved ingredients count; a proposed one shows in the meal but not in totals.
  const totals = mealTotals(items.filter((i) => i.ingredient.status === "approved").map((i) => ({ nutrients: i.ingredient.nutrients, qty: i.qty })));
  return { ...meal, totals, items };
}

export function listMeals(): MealWithTotals[] {
  const ids = getDb().prepare("SELECT id FROM meals ORDER BY name").all() as { id: number }[];
  return ids.map((r) => getMeal(r.id)!);
}

export type SlotOption = { optionId: number; meal: MealWithTotals; isPlanned: boolean; adjust?: OptionAdjust };
// A part is one thing eaten in the slot; several options in a part are variations of it.
export type Part = { part: number; options: SlotOption[] };
export type Slot = { id: number; name: string; parts: Part[] };
// One of a day's six versions (workout or rest, for each goal): the base day plus adjustments.
// `slots` is the day this version actually eats, already resolved; the base is on the Day.
export type Version = VersionKey & { id: number; dayId: number; status: Status; adjustments: Adjustment[]; slots: Slot[] };
export type Day = { id: number; name: string; notes: string; slots: Slot[]; versions: Version[] };

export { partKey };

// The base slots of a day, with their meals grouped into parts.
function loadSlots(dayId: number): Slot[] {
  const db = getDb();
  const slots = db.prepare("SELECT id, name FROM day_slots WHERE day_id = ? ORDER BY position, id").all(dayId) as { id: number; name: string }[];
  return slots.map((s) => {
    const parts = new Map<number, SlotOption[]>();
    for (const o of db.prepare("SELECT id, meal_id, is_planned, part FROM slot_options WHERE slot_id = ? ORDER BY part, id").all(s.id) as Row[]) {
      const list = parts.get(o.part as number) ?? [];
      list.push({ optionId: o.id as number, meal: getMeal(o.meal_id as number)!, isPlanned: !!o.is_planned });
      parts.set(o.part as number, list);
    }
    return { ...s, parts: [...parts].map(([part, options]) => ({ part, options })) };
  });
}

function loadAdjustments(versionId: number): Adjustment[] {
  const rows = getDb().prepare("SELECT id, kind, option_id, slot_id, meal_id, ingredient_id, qty, factor FROM version_adjustments WHERE version_id = ? ORDER BY id").all(versionId) as Row[];
  return rows.map((r): Adjustment => {
    if (r.kind === "remove") return { id: r.id as number, kind: "remove", optionId: r.option_id as number };
    if (r.kind === "scale") return { id: r.id as number, kind: "scale", optionId: r.option_id as number, factor: r.factor as number };
    if (r.kind === "plan") return { id: r.id as number, kind: "plan", optionId: r.option_id as number };
    return { id: r.id as number, kind: "add", slotId: r.slot_id as number, mealId: r.meal_id as number | null, ingredientId: r.ingredient_id as number | null, qty: r.qty as number };
  });
}

export function getDay(id: number): Day | undefined {
  const db = getDb();
  const day = db.prepare("SELECT id, name, notes FROM days WHERE id = ?").get(id) as unknown as Omit<Day, "slots" | "versions"> | undefined;
  if (!day) return undefined;
  const slots = loadSlots(id);
  const ingredients = new Map(listIngredients().map((i) => [i.id, i]));
  const lookup = { meal: (mealId: number) => getMeal(mealId), ingredient: (ingredientId: number) => ingredients.get(ingredientId) };
  const versions = db.prepare("SELECT id, day_id, kind, goal, status FROM day_versions WHERE day_id = ? ORDER BY id").all(id) as Row[];
  return {
    ...day,
    slots,
    versions: versions.map((v) => {
      const adjustments = loadAdjustments(v.id as number);
      return {
        id: v.id as number, dayId: v.day_id as number, kind: v.kind as DayKind, goal: v.goal as Goal, status: v.status as Status,
        adjustments, slots: resolveVersion(slots, adjustments, lookup),
      };
    }),
  };
}

// There is one day. A database that has none (a fresh install) gets it here; with several, the first by position is the one.
export function getOnlyDay(): Day {
  const db = getDb();
  const row = db.prepare("SELECT id FROM days ORDER BY position, id LIMIT 1").get() as { id: number } | undefined;
  const id = row?.id ?? Number(db.prepare("INSERT INTO days (name, position) VALUES ('Standard day', 1)").run().lastInsertRowid);
  return getDay(id)!;
}

export function listDays(): Day[] {
  return (getDb().prepare("SELECT id FROM days ORDER BY position, id").all() as { id: number }[]).map((r) => getDay(r.id)!);
}

// "Shake + Greens" for things eaten together, "A / B" for variations of one of them.
export function describeSlot(slot: Slot): string {
  return slot.parts.map((p) => p.options.map((o) => o.meal.name).join(" / ")).join(" + ");
}

// Totals for a day given a choice of option per part (keyed by partKey); defaults to the planned one.
export function totalsForChoice(version: { slots: Slot[] }, chosen: Record<string, number> = {}): Nutrients {
  return dayTotals(chosenOptions(version.slots, chosen).map(({ option }) => option.meal.totals));
}

// Shared targets, with calories and macros taken from the given goal.
export function listTargets(goal: Goal): Record<string, Target> {
  const db = getDb();
  const out: Record<string, Target> = {};
  for (const r of db.prepare("SELECT * FROM targets").all() as Row[]) {
    out[r.nutrient as string] = { workout: r.workout as number | null, rest: r.rest as number | null, daily: r.daily as number | null, type: r.type as Target["type"] };
  }
  for (const r of db.prepare("SELECT * FROM goal_targets WHERE goal = ?").all(goal) as Row[]) {
    out[r.nutrient as string] = { workout: r.workout as number, rest: r.rest as number, daily: null, type: null };
  }
  return out;
}

// Recomputes the calories and macro targets for every goal from the profile.
export function saveGoalTargets(profile: Profile) {
  const set = getDb().prepare(
    "INSERT INTO goal_targets (goal, nutrient, workout, rest) VALUES (?, ?, ?, ?) ON CONFLICT(goal, nutrient) DO UPDATE SET workout = excluded.workout, rest = excluded.rest",
  );
  for (const r of goalTargetRows(profile)) set.run(r.goal, r.nutrient, r.workout, r.rest);
}

export function versionExists(dayId: number, kind: DayKind, goal: Goal): boolean {
  return !!getDb().prepare("SELECT 1 FROM day_versions WHERE day_id = ? AND kind = ? AND goal = ?").get(dayId, kind, goal);
}

// Copies one version's adjustments onto another, so a new version starts out like an existing one.
function copyAdjustments(from: number, to: number) {
  getDb().prepare(
    `INSERT INTO version_adjustments (version_id, kind, option_id, slot_id, meal_id, ingredient_id, qty, factor)
     SELECT ?, kind, option_id, slot_id, meal_id, ingredient_id, qty, factor FROM version_adjustments WHERE version_id = ?`,
  ).run(to, from);
}

// No transaction of its own: callers that already hold one use this.
export function insertVersion(dayId: number, kind: DayKind, goal: Goal, status: Status, copyFrom?: number): number {
  const id = Number(getDb().prepare("INSERT INTO day_versions (day_id, kind, goal, status) VALUES (?, ?, ?, ?)").run(dayId, kind, goal, status).lastInsertRowid);
  if (copyFrom !== undefined) copyAdjustments(copyFrom, id);
  return id;
}

// Adds a version to a day, optionally starting from another version's adjustments. An existing version is returned untouched.
export function createVersion(dayId: number, kind: DayKind, goal: Goal, opts: { status?: Status; copyFrom?: number } = {}): number {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM day_versions WHERE day_id = ? AND kind = ? AND goal = ?").get(dayId, kind, goal) as { id: number } | undefined;
  if (existing) return existing.id;
  db.exec("BEGIN");
  try {
    const id = insertVersion(dayId, kind, goal, opts.status ?? "approved", opts.copyFrom);
    db.exec("COMMIT");
    return id;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// Rejects a proposed version; an approved one is never removed this way.
export function rejectVersion(id: number) {
  getDb().prepare("DELETE FROM day_versions WHERE id = ? AND status = 'proposed'").run(id);
}

// Things waiting for approval: ingredients, meals, day versions, suggested changes and liked foods.
export function pendingCount(): number {
  return (getDb().prepare(
    "SELECT (SELECT COUNT(*) FROM ingredients WHERE status='proposed') + (SELECT COUNT(*) FROM meals WHERE status='proposed') + (SELECT COUNT(*) FROM day_versions WHERE status='proposed') + (SELECT COUNT(*) FROM proposals WHERE status='pending') + (SELECT COUNT(*) FROM liked_foods WHERE status='proposed') AS n",
  ).get() as { n: number }).n;
}

export type Location = { id: number; parent_id: number | null; name: string; position: number };

export function listLocations(): Location[] {
  return getDb().prepare("SELECT * FROM locations ORDER BY position, id").all() as unknown as Location[];
}

// Ingredient ids that no meal uses (proposed meals count: they're in a meal, just not approved yet).
export function unusedIngredientIds(): Set<number> {
  const rows = getDb().prepare("SELECT id FROM ingredients WHERE id NOT IN (SELECT ingredient_id FROM meal_items)").all() as { id: number }[];
  return new Set(rows.map((r) => r.id));
}

export type Placement = { ingredient_id: number; location_id: number; status: Status };

export function listPlacements(): Placement[] {
  return getDb().prepare("SELECT ingredient_id, location_id, status FROM ingredient_locations").all() as unknown as Placement[];
}

// Every real ingredient in the base day or added to an approved version, variations included.
export function dayIngredients(day: Day): Ingredient[] {
  const byId = new Map<number, Ingredient>();
  for (const slot of [...day.slots, ...day.versions.filter((v) => v.status === "approved").flatMap((v) => v.slots)]) {
    for (const part of slot.parts) {
      for (const option of part.options) {
        for (const item of option.meal.items) {
          if (item.ingredient.serving !== STUB_SERVING) byId.set(item.ingredient.id, item.ingredient);
        }
      }
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// Every combination of one option per part that has more than one option,
// capped so the comparison table stays readable.
export function variantCombos(version: { slots: Slot[] }, cap = 12): Record<string, number>[] {
  let combos: Record<string, number>[] = [{}];
  for (const slot of version.slots) {
    for (const part of slot.parts.filter((p) => p.options.length > 1)) {
      combos = combos.flatMap((c) => part.options.map((o) => ({ ...c, [partKey(slot.id, part.part)]: o.optionId })));
    }
  }
  return combos.slice(0, cap);
}


export function getProfile(): Profile | null {
  const r = getDb().prepare("SELECT * FROM profile WHERE id = 1").get() as Row | undefined;
  if (!r) return null;
  return {
    age: r.age as number, sex: r.sex as Profile["sex"], heightCm: r.height_cm as number, weightKg: r.weight_kg as number,
    workoutDays: r.workout_days as number,
  };
}
