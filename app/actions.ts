"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getDb } from "../lib/db.ts";
import { GOALS, parseProfile, planTargets, type Goal } from "../lib/calculators.ts";
import { createVersion, getOnlyDay, rejectVersion, saveGoalTargets } from "../lib/queries.ts";
import { parseVersionKey } from "../lib/versions.ts";
import { NUTRIENTS } from "../lib/nutrients.ts";
import { acceptProposal, createFixAllProposals, createFixProposal, createMatchAllProposals, dismissProposal } from "../lib/fixes.ts";
import { setTolerance } from "../lib/tolerances.ts";
import { proposeIngredients, proposeLikes, proposeMeal, proposePlacements } from "../lib/ai.ts";
import { approveLike, likeFood, rejectLike, renameLikedSlot, unlikeFood } from "../lib/likes.ts";
import { addFood, planMeal, removeAdjustment, removeMeal, resetVersion, restoreMeal, scaleMeal, setAddedQty } from "../lib/adjustments.ts";

const TABLES = { ingredient: "ingredients", meal: "meals", version: "day_versions" } as const;
type Kind = keyof typeof TABLES;
const refresh = () => revalidatePath("/", "layout");
const int = (f: FormData, k: string) => Number(f.get(k));
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

export async function approve(kind: Kind, id: number) {
  getDb().prepare(`UPDATE ${TABLES[kind]} SET status = 'approved' WHERE id = ?`).run(id);
  refresh();
}

// Only proposals can be rejected; approved things are removed from their own pages.
export async function reject(kind: Kind, id: number) {
  if (kind === "version") rejectVersion(id);
  else getDb().prepare(`DELETE FROM ${TABLES[kind]} WHERE id = ? AND status = 'proposed'`).run(id);
  refresh();
}

export async function approveAll() {
  const db = getDb();
  // Order matters: meals need approved ingredients to show real totals.
  for (const t of ["ingredients", "meals", "day_versions"]) db.prepare(`UPDATE ${t} SET status = 'approved' WHERE status = 'proposed'`).run();
  refresh();
}

export type GenerateState = { message: string } | null;

async function generate(fn: (request: string) => Promise<{ added: string[]; skipped: string[] }>, formData: FormData): Promise<GenerateState> {
  const request = str(formData, "request");
  if (!request) return { message: "Describe what you want first." };
  try {
    const r = await fn(request);
    refresh();
    return { message: `Proposed: ${r.added.join(", ") || "nothing"}.${r.skipped.length ? ` Skipped: ${r.skipped.join("; ")}.` : ""}` };
  } catch (e) {
    return { message: `Failed: ${(e as Error).message}` };
  }
}
export async function generateIngredients(_: GenerateState, f: FormData) { return generate(proposeIngredients, f); }
export async function generateMeal(_: GenerateState, f: FormData) { return generate(proposeMeal, f); }
export async function generateLikes(_: GenerateState, f: FormData) { return generate(proposeLikes, f); }

export async function setDairy(id: number, value: boolean) {
  getDb().prepare("UPDATE ingredients SET contains_dairy = ? WHERE id = ?").run(value ? 1 : 0, id);
  refresh();
}

export async function deleteIngredient(id: number) {
  const db = getDb();
  if (db.prepare("SELECT 1 FROM meal_items WHERE ingredient_id = ?").get(id)) return; // still used by a meal
  db.prepare("DELETE FROM ingredients WHERE id = ?").run(id);
  refresh();
}

// Meals
export async function createMeal(f: FormData) {
  const name = str(f, "name");
  if (name) getDb().prepare("INSERT OR IGNORE INTO meals (name, typical_slot, status) VALUES (?, ?, 'approved')").run(name, str(f, "slot"));
  refresh();
}
export async function setMealItem(f: FormData) {
  const qty = Number(f.get("qty"));
  if (!(qty > 0)) return;
  getDb().prepare("INSERT OR REPLACE INTO meal_items (meal_id, ingredient_id, qty) VALUES (?, ?, ?)").run(int(f, "meal"), int(f, "ingredient"), qty);
  refresh();
}
export async function removeMealItem(mealId: number, ingredientId: number) {
  getDb().prepare("DELETE FROM meal_items WHERE meal_id = ? AND ingredient_id = ?").run(mealId, ingredientId);
  refresh();
}
export async function deleteMeal(id: number) {
  const db = getDb();
  if (db.prepare("SELECT 1 FROM slot_options WHERE meal_id = ?").get(id)) return; // still used by a day
  db.prepare("DELETE FROM meals WHERE id = ?").run(id);
  refresh();
}

// A version is the base day plus adjustments. The page names a version by goal and kind; it is created the first time it is changed.
const versionOf = (f: FormData) => {
  const { kind, goal } = parseVersionKey({ kind: str(f, "kind"), goal: str(f, "goal") });
  return createVersion(getOnlyDay().id, kind, goal);
};

// Runs a change to a version. A stale page or a bad form value shows up as a message on the page instead of an error screen.
function change(f: FormData, run: (versionId: number) => void) {
  const { kind, goal } = parseVersionKey({ kind: str(f, "kind"), goal: str(f, "goal") });
  let error: string | undefined;
  try { run(createVersion(getOnlyDay().id, kind, goal)); } catch (e) { error = (e as Error).message; }
  refresh();
  if (error) redirect(`/days/${getOnlyDay().id}?goal=${goal}&kind=${kind}&error=${encodeURIComponent(error)}`);
}

const backTo = (goal: string, kind: string, extra: string) => `/days/${getOnlyDay().id}?goal=${goal}&kind=${kind}&${extra}`;

// Ask for a fix: focused on one nutrient when the form names one, otherwise for everything. It waits on Review.
export async function proposeFix(f: FormData) {
  const { kind, goal } = parseVersionKey({ kind: str(f, "kind"), goal: str(f, "goal") });
  const nutrient = NUTRIENTS.find((n) => n.key === str(f, "nutrient"))?.key;
  const id = createFixProposal(createVersion(getOnlyDay().id, kind, goal), nutrient ? [nutrient] : null);
  refresh();
  redirect(id ? "/review" : backTo(goal, kind, "notice=nochange"));
}

// Refit every other version, starting from this one's changes.
export async function proposeForAll(f: FormData) {
  const { kind, goal } = parseVersionKey({ kind: str(f, "kind"), goal: str(f, "goal") });
  const ids = createMatchAllProposals(createVersion(getOnlyDay().id, kind, goal));
  refresh();
  redirect(ids.length ? "/review" : backTo(goal, kind, "notice=nochange"));
}

// One suggestion per version that can be improved, from the base day and your liked foods.
export async function proposeAllVersions() {
  const ids = createFixAllProposals();
  refresh();
  redirect(ids.length ? "/review" : `/days/${getOnlyDay().id}?view=base&notice=nochange`);
}

export async function acceptSuggestion(id: number) {
  const error = acceptProposal(id);
  refresh();
  redirect(error ? `/review?error=${encodeURIComponent(error)}` : "/review");
}
export async function dismissSuggestion(id: number) { dismissProposal(id); refresh(); }

// "It's okay to exceed this", from the number's popover; the guardrails decide whether that is allowed.
export async function allowExceed(f: FormData) {
  const { kind, goal } = parseVersionKey({ kind: str(f, "kind"), goal: str(f, "goal") });
  const key = NUTRIENTS.find((n) => n.key === str(f, "nutrient"))?.key;
  const error = key ? setTolerance(key, true, null) : "That nutrient isn't known.";
  refresh();
  redirect(backTo(goal, kind, error ? `error=${encodeURIComponent(error)}` : "notice=allowed"));
}

// The Targets page form: a checkbox and an optional limit per nutrient.
export async function saveTolerance(f: FormData) {
  const key = NUTRIENTS.find((n) => n.key === str(f, "nutrient"))?.key;
  const upTo = str(f, "upTo") === "" ? null : Number(f.get("upTo"));
  const error = !key ? "That nutrient isn't known." : upTo !== null && !Number.isFinite(upTo) ? "The limit must be a number." : setTolerance(key, f.get("ok") === "on", upTo);
  refresh();
  redirect(error ? `/targets?error=${encodeURIComponent(error)}` : "/targets");
}

// Foods you like, per meal. The form names the meal by its slot name.
export async function likeFoodAction(f: FormData) {
  const error = likeFood(int(f, "ingredient"), str(f, "slot"));
  refresh();
  if (error) redirect(`/days/${getOnlyDay().id}?view=base&error=${encodeURIComponent(error)}`);
}
export async function unlikeFoodAction(ingredientId: number, slotName: string) { unlikeFood(ingredientId, slotName); refresh(); }
export async function approveLikeAction(ingredientId: number, slotName: string) { approveLike(ingredientId, slotName); refresh(); }
export async function rejectLikeAction(ingredientId: number, slotName: string) { rejectLike(ingredientId, slotName); refresh(); }

export async function removeFromVersion(f: FormData) { change(f, (v) => removeMeal(v, int(f, "option"))); }
export async function restoreToVersion(f: FormData) { change(f, (v) => restoreMeal(v, int(f, "option"))); }
export async function scaleInVersion(f: FormData) { change(f, (v) => scaleMeal(v, int(f, "option"), Number(f.get("factor")))); }
export async function planInVersion(f: FormData) { change(f, (v) => planMeal(v, int(f, "option"))); }
export async function resetVersionToBase(f: FormData) { change(f, (v) => resetVersion(v)); }

// The food field is "i:<ingredient id>" or "m:<meal id>".
export async function addFoodToVersion(f: FormData) {
  change(f, (v) => {
    const [type, id] = str(f, "food").split(":");
    if (!id || (type !== "i" && type !== "m")) throw new Error("Choose a food to add.");
    addFood(v, int(f, "slot"), type === "i" ? { ingredientId: Number(id) } : { mealId: Number(id) }, Number(f.get("qty")));
  });
}
// A blank amount is refused rather than read as zero, which would remove the food; the remove button does that.
export async function setAddedFoodQty(f: FormData) {
  change(f, () => {
    if (str(f, "qty") === "") throw new Error("Enter an amount, or use remove to take the food out.");
    const qty = Number(f.get("qty"));
    if (!(qty > 0)) throw new Error("The quantity must be more than 0; use remove to take the food out.");
    setAddedQty(int(f, "adjustment"), qty);
  });
}
export async function removeAddedFood(f: FormData) { change(f, () => removeAdjustment(int(f, "adjustment"))); }

export async function addSlot(f: FormData) {
  const db = getDb();
  const day = getOnlyDay().id;
  const pos = (db.prepare("SELECT COALESCE(MAX(position), 0) + 1 AS p FROM day_slots WHERE day_id = ?").get(day) as { p: number }).p;
  if (str(f, "name")) db.prepare("INSERT INTO day_slots (day_id, name, position) VALUES (?, ?, ?)").run(day, str(f, "name"), pos);
  refresh();
}
export async function removeSlot(id: number) {
  getDb().prepare("DELETE FROM day_slots WHERE id = ?").run(id);
  refresh();
}
// part "new" starts another thing eaten in the same slot; a number adds a variation to that part.
export async function addOption(f: FormData) {
  const db = getDb();
  const slot = int(f, "slot");
  const requested = str(f, "part");
  const part = requested === "new"
    ? (db.prepare("SELECT COALESCE(MAX(part), -1) + 1 AS p FROM slot_options WHERE slot_id = ?").get(slot) as { p: number }).p
    : Number(requested || 0);
  const first = !db.prepare("SELECT 1 FROM slot_options WHERE slot_id = ? AND part = ?").get(slot, part);
  db.prepare("INSERT OR IGNORE INTO slot_options (slot_id, meal_id, is_planned, part) VALUES (?, ?, ?, ?)").run(slot, int(f, "meal"), first ? 1 : 0, part);
  refresh();
}
export async function removeOption(id: number) {
  const db = getDb();
  const opt = db.prepare("SELECT slot_id, part, is_planned FROM slot_options WHERE id = ?").get(id) as { slot_id: number; part: number; is_planned: number } | undefined;
  if (!opt) return;
  db.prepare("DELETE FROM slot_options WHERE id = ?").run(id);
  if (opt.is_planned) {
    db.prepare("UPDATE slot_options SET is_planned = 1 WHERE id = (SELECT MIN(id) FROM slot_options WHERE slot_id = ? AND part = ?)").run(opt.slot_id, opt.part);
  }
  refresh();
}
export async function setPlanned(optionId: number) {
  const db = getDb();
  const opt = db.prepare("SELECT slot_id, part FROM slot_options WHERE id = ?").get(optionId) as { slot_id: number; part: number } | undefined;
  if (!opt) return;
  db.prepare("UPDATE slot_options SET is_planned = (id = ?) WHERE slot_id = ? AND part = ?").run(optionId, opt.slot_id, opt.part);
  refresh();
}
// Returns a message when the name can't be used, nothing when it worked.
function renameUnique(table: "meals" | "ingredients", noun: string, id: number, name: string): string | void {
  const trimmed = name.trim();
  if (!trimmed) return `A ${noun} needs a name.`;
  const db = getDb();
  if (db.prepare(`SELECT 1 FROM ${table} WHERE name = ? AND id != ?`).get(trimmed, id)) return `There is already a ${noun} called “${trimmed}”.`;
  db.prepare(`UPDATE ${table} SET name = ? WHERE id = ?`).run(trimmed, id);
  refresh();
}
export async function renameMeal(id: number, name: string) { return renameUnique("meals", "meal", id, name); }
export async function renameIngredient(id: number, name: string) { return renameUnique("ingredients", "ingredient", id, name); }
// Slot names may repeat across days, so any non-empty name works.
export async function renameSlot(id: number, name: string): Promise<string | void> {
  const trimmed = name.trim();
  if (!trimmed) return "A slot needs a name.";
  const db = getDb();
  const before = db.prepare("SELECT name FROM day_slots WHERE id = ?").get(id) as { name: string } | undefined;
  db.prepare("UPDATE day_slots SET name = ? WHERE id = ?").run(trimmed, id);
  if (before) renameLikedSlot(before.name, trimmed);
  refresh();
}
export async function moveSlot(slotId: number, by: number) {
  const db = getDb();
  const slot = db.prepare("SELECT day_id FROM day_slots WHERE id = ?").get(slotId) as { day_id: number } | undefined;
  if (!slot) return;
  const ids = (db.prepare("SELECT id FROM day_slots WHERE day_id = ? ORDER BY position, id").all(slot.day_id) as { id: number }[]).map((r) => r.id);
  const from = ids.indexOf(slotId), to = from + by;
  if (to < 0 || to >= ids.length) return;
  ids.splice(to, 0, ids.splice(from, 1)[0]);
  const set = db.prepare("UPDATE day_slots SET position = ? WHERE id = ?");
  ids.forEach((id, index) => set.run(index, id));
  refresh();
}
// ids in the order they should appear
// Kitchen
export async function addLocation(f: FormData) {
  if (str(f, "name")) {
    getDb().prepare("INSERT INTO locations (parent_id, name, position) VALUES (NULL, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM locations))").run(str(f, "name"));
  }
  refresh();
}
export async function renameLocation(id: number, name: string) {
  const trimmed = name.trim();
  if (trimmed) getDb().prepare("UPDATE locations SET name = ? WHERE id = ?").run(trimmed, id);
  refresh();
}
// ids in the order they should appear
export async function reorderLocations(ids: number[]) {
  const set = getDb().prepare("UPDATE locations SET position = ? WHERE id = ?");
  ids.forEach((id, index) => set.run(index, id));
  refresh();
}
export async function deleteLocation(id: number) {
  getDb().prepare("DELETE FROM locations WHERE id = ?").run(id);
  refresh();
}
export async function assignIngredient(f: FormData) {
  // Placing something by hand also approves it if the AI had already proposed that spot.
  getDb().prepare("INSERT INTO ingredient_locations (ingredient_id, location_id, status) VALUES (?, ?, 'approved') ON CONFLICT DO UPDATE SET status = 'approved'")
    .run(int(f, "ingredient"), int(f, "location"));
  refresh();
}
export async function approvePlacement(ingredientId: number, locationId: number) {
  getDb().prepare("UPDATE ingredient_locations SET status = 'approved' WHERE ingredient_id = ? AND location_id = ?").run(ingredientId, locationId);
  refresh();
}
export async function approveAllPlacements() {
  getDb().prepare("UPDATE ingredient_locations SET status = 'approved' WHERE status = 'proposed'").run();
  refresh();
}
export async function rejectAllPlacements() {
  getDb().prepare("DELETE FROM ingredient_locations WHERE status = 'proposed'").run();
  refresh();
}

export async function placeIngredients(): Promise<GenerateState> {
  try {
    const r = await proposePlacements([getOnlyDay().id]);
    refresh();
    if (r.ingredients === 0) return { message: r.alreadyPlaced ? `All ${r.alreadyPlaced} ingredients already have a place.` : "No ingredients to place." };
    const parts = [`Proposed ${r.placed} placement${r.placed === 1 ? "" : "s"} for ${r.ingredients} ingredient${r.ingredients === 1 ? "" : "s"}.`];
    if (r.alreadyPlaced) parts.push(`${r.alreadyPlaced} already had a place.`);
    if (r.unmatched.length) parts.push(`Ignored: ${r.unmatched.join("; ")}.`);
    return { message: parts.join(" ") };
  } catch (e) {
    return { message: `Failed: ${(e as Error).message}` };
  }
}
export async function unassignIngredient(ingredientId: number, locationId: number) {
  getDb().prepare("DELETE FROM ingredient_locations WHERE ingredient_id = ? AND location_id = ?").run(ingredientId, locationId);
  refresh();
}

// Targets: the calculators' profile, and the calories and macros it sets for every goal.
export type ProfileState = { message: string } | null;

export async function saveProfile(_: ProfileState, form: FormData): Promise<ProfileState> {
  const parsed = parseProfile(form);
  if ("error" in parsed) return { message: parsed.error };
  const p = parsed.profile;
  try {
    for (const g of GOALS) planTargets(p, g.value); // refuses a calorie goal under 1200 before anything is saved
  } catch (e) {
    return { message: (e as Error).message };
  }
  getDb().prepare(
    `INSERT INTO profile (id, age, sex, height_cm, weight_kg, workout_days) VALUES (1, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET age = excluded.age, sex = excluded.sex, height_cm = excluded.height_cm, weight_kg = excluded.weight_kg,
       workout_days = excluded.workout_days`,
  ).run(p.age, p.sex, p.heightCm, p.weightKg, p.workoutDays);
  saveGoalTargets(p);
  refresh();
  return null;
}
