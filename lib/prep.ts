// Prep: what has to be made ahead to keep the typical day going, and how often. A meal's prep says what to make,
// how many servings one batch gives, how long it keeps and how often it's made. How much of it gets eaten comes from
// the base day, taking every variation of a part as eaten equally often (the same reading as the day's typical
// totals), plus what other meals take from it: a meal whose recipe links to this one ("see [[Roast Chicken]]")
// uses up part of its batch.
import { getDb } from "./db.ts";
import { getOnlyDay, listMeals, type MealWithTotals, type Slot } from "./queries.ts";

const WEEK = 7;
const MAX_TASK = 300;
const MAX_MAKES = 1000;
const MAX_DAYS = 365;
// A batch that lasts a week or more is made on a weekly rhythm, not every 9 days.
const WEEKLY_STEPS = [28, 14, 7];
// Half a day of slack before a cadence counts as running out.
const SLACK_DAYS = 0.5;

// task: what to do ("Bake one pan"). makes: servings in a batch. keepsDays: how long a batch stays good, 0 when not
// known. everyDays: how often it's made.
export type PrepInput = { task: string; makes: number; keepsDays: number; everyDays: number };
// perWeek: servings eaten in a week. lastsDays: how long a batch lasts at that rate. suggestedDays: the cadence the
// numbers give. Both are null when the meal isn't in the day. runsOut: a batch is gone before the next one is made.
// outlastsKeeping: some of a batch is still around after it stops being good, so it needs freezing or a smaller batch.
export type Prep = PrepInput & { mealId: number; name: string; perWeek: number; lastsDays: number | null; suggestedDays: number | null; runsOut: boolean; outlastsKeeping: boolean };
// The user meal takes this share of one serving of the source meal each time it's eaten.
export type Use = { user: number; source: number; share: number };

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

// Checks a prep that came from outside (a form or the API). Returns it cleaned, or what was wrong.
export function parsePrep(input: unknown): PrepInput | { error: string } {
  if (!isObject(input)) return { error: "Send a JSON object." };
  const task = typeof input.task === "string" ? input.task.trim() : "";
  if (!task) return { error: "Prep needs a task: what to make." };
  if (task.length > MAX_TASK) return { error: `task is longer than ${MAX_TASK} characters.` };
  const { makes, keepsDays = 0, everyDays } = input;
  if (typeof makes !== "number" || !(makes > 0) || makes > MAX_MAKES) return { error: `makes must be a number of servings, more than 0 and at most ${MAX_MAKES}.` };
  if (typeof keepsDays !== "number" || !Number.isInteger(keepsDays) || keepsDays < 0 || keepsDays > MAX_DAYS) return { error: `keepsDays must be a whole number of days from 0 to ${MAX_DAYS} (0 when not known).` };
  if (typeof everyDays !== "number" || !Number.isInteger(everyDays) || everyDays < 1 || everyDays > MAX_DAYS) return { error: `everyDays must be a whole number of days from 1 to ${MAX_DAYS}.` };
  return { task, makes, keepsDays, everyDays };
}

// Servings of each meal eaten in a week of base days: one of a part's n variations is eaten each day, so each counts
// 7/n. A meal other meals take from also counts what they take.
export function weeklyServings(slots: Slot[], uses: Use[] = []): Map<number, number> {
  const direct = new Map<number, number>();
  for (const slot of slots) for (const part of slot.parts) for (const option of part.options) {
    direct.set(option.meal.id, (direct.get(option.meal.id) ?? 0) + WEEK / part.options.length);
  }
  const total = new Map(direct);
  for (const use of uses) {
    const eaten = direct.get(use.user);
    if (eaten) total.set(use.source, (total.get(use.source) ?? 0) + eaten * use.share);
  }
  return total;
}

// How much of one serving of source the user meal takes: its amount of source's main counted ingredient (the one
// giving source the most calories), against source's own. 0 when it doesn't count that ingredient.
export function shareUsed(user: MealWithTotals, source: MealWithTotals): number {
  const calories = (i: MealWithTotals["items"][number]) => (i.ingredient.nutrients.calories ?? 0) * i.qty;
  const main = source.items.toSorted((a, b) => calories(b) - calories(a))[0];
  const used = main && user.items.find((i) => i.ingredient.id === main.ingredient.id);
  return used ? used.qty / main.qty : 0;
}

// How long a batch lasts at the rate it's eaten, in days. null when none is eaten.
export function batchLasts(makes: number, perWeek: number): number | null {
  return perWeek > 0 ? makes / (perWeek / WEEK) : null;
}

// How often to make a batch: when it runs out, in whole days; a week or more snaps down to 1, 2 or 4 weeks.
// How long it keeps doesn't shorten this: a batch that outlasts its keeping is frozen in part or made smaller.
export function suggestEvery(makes: number, perWeek: number): number | null {
  const lasts = batchLasts(makes, perWeek);
  if (lasts === null) return null;
  const days = Math.max(1, Math.floor(lasts));
  return WEEKLY_STEPS.find((step) => days >= step) ?? days;
}

export function cadenceLabel(days: number): string {
  if (days === 1) return "Every day";
  if (days === WEEK) return "Every week";
  return days % WEEK === 0 ? `Every ${days / WEEK} weeks` : `Every ${days} days`;
}

// Which meals take from which, read from the [[links]] in recipe ingredient lines.
function linkedUses(meals: MealWithTotals[]): Use[] {
  const byName = new Map(meals.map((m) => [m.name.toLowerCase(), m]));
  const byId = new Map(meals.map((m) => [m.id, m]));
  const lines = getDb().prepare("SELECT meal_id, text FROM meal_lines WHERE text LIKE '%[[%'").all() as { meal_id: number; text: string }[];
  const uses = new Map<string, Use>();
  for (const line of lines) for (const [, name] of line.text.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const user = byId.get(line.meal_id), source = byName.get(name.trim().toLowerCase());
    if (!user || !source || user.id === source.id) continue;
    const share = shareUsed(user, source);
    if (share > 0) uses.set(`${user.id}>${source.id}`, { user: user.id, source: source.id, share });
  }
  return [...uses.values()];
}

// Servings of every meal eaten in a week of the base day.
export function eatenPerWeek(): Map<number, number> {
  return weeklyServings(getOnlyDay().slots, linkedUses(listMeals()));
}

type Row = { meal_id: number; name: string; task: string; makes: number; keeps_days: number; every_days: number };

// Every meal's prep, most frequent first.
export function listPrep(): Prep[] {
  const rows = getDb().prepare(`SELECT p.meal_id, m.name, p.task, p.makes, p.keeps_days, p.every_days FROM meal_prep p JOIN meals m ON m.id = p.meal_id
    ORDER BY p.every_days, m.name COLLATE NOCASE`).all() as Row[];
  const eaten = rows.length ? eatenPerWeek() : new Map<number, number>();
  return rows.map((r) => {
    const perWeek = eaten.get(r.meal_id) ?? 0;
    const lastsDays = batchLasts(r.makes, perWeek);
    return {
      mealId: r.meal_id, name: r.name, task: r.task, makes: r.makes, keepsDays: r.keeps_days, everyDays: r.every_days,
      perWeek, lastsDays, suggestedDays: suggestEvery(r.makes, perWeek),
      runsOut: lastsDays !== null && lastsDays + SLACK_DAYS < r.every_days,
      outlastsKeeping: r.keeps_days > 0 && Math.min(r.every_days, lastsDays ?? r.every_days) > r.keeps_days,
    };
  });
}

// Sets a meal's prep, replacing what it had. Throws when there is no such meal.
export function savePrep(mealId: number, input: PrepInput): void {
  const db = getDb();
  if (!db.prepare("SELECT 1 FROM meals WHERE id = ?").get(mealId)) throw new Error("No meal with that id.");
  db.prepare(`INSERT INTO meal_prep (meal_id, task, makes, keeps_days, every_days) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (meal_id) DO UPDATE SET task = excluded.task, makes = excluded.makes, keeps_days = excluded.keeps_days, every_days = excluded.every_days`)
    .run(mealId, input.task, input.makes, input.keepsDays, input.everyDays);
}

export function removePrep(mealId: number): void {
  getDb().prepare("DELETE FROM meal_prep WHERE meal_id = ?").run(mealId);
}
