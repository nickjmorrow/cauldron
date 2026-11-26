// Recipes: how a meal is cooked and shopped for. A recipe is the cooking half of a meal (its id and name are the
// meal's): a list of ingredients (each line as written, plus what to buy for it) and free-text sections (instructions,
// log, storage...). The meal's counted ingredients carry the nutrition; a recipe never feeds totals. A recipe is
// typical when its meal is in the typical day, and typical recipes are what a shopping item is "for" when it's added
// without a reason.
import { getDb } from "./db.ts";
import { getOnlyDay, inUse } from "./queries.ts";

// text: the line as written ("1/2 cup low-sodium soy sauce"). buy: what to put on a shopping list for it
// ("low-sodium soy sauce"), or "" for things nobody shops for (water). Several names, split by ";", when a line holds
// more than one thing or the thing goes by more than one name ("ground cumin; garlic powder").
// group: a sub-list heading ("to finish"), or "".
export type RecipeIngredient = { group: string; text: string; buy: string };
// body is Markdown bullets, nested by two spaces.
export type RecipeSection = { title: string; body: string };
export type RecipeInput = {
  name: string; summary: string; serves: string; activeTime: string; totalTime: string; tags: string[];
  ingredients: RecipeIngredient[]; sections: RecipeSection[];
};
export type Recipe = RecipeInput & { id: number; typical: boolean };
export type RecipeRow = { id: number; name: string; summary: string; tags: string[]; typical: boolean };

const MAX_FILLED = 3;
const MAX_NAME = 200;
const MAX_LINE = 1000;
const MAX_BODY = 50_000;
const MAX_ROWS = 300;
const HEAD_FIELDS = ["summary", "serves", "activeTime", "totalTime"] as const;

// "Celery, Raw" and "celery" are the same thing to buy, and so are "Eggs" and "Egg": the text before the first
// comma or bracket, lower-cased, without a plural "s".
export function buyName(name: string): string {
  return name.split(/[,(]/)[0].trim().toLowerCase().replace(/s$/, "");
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
const text = (x: unknown) => (typeof x === "string" ? x.trim() : undefined);

// Checks a recipe that came from outside (a form, the API, an import file). Returns it cleaned, or what was wrong.
export function parseRecipe(input: unknown): RecipeInput | { error: string } {
  if (!isObject(input)) return { error: "Send a JSON object." };
  const name = text(input.name);
  if (!name) return { error: "A recipe needs a name." };
  if (name.length > MAX_NAME) return { error: `name is longer than ${MAX_NAME} characters.` };
  const recipe: RecipeInput = { name, summary: "", serves: "", activeTime: "", totalTime: "", tags: [], ingredients: [], sections: [] };
  for (const field of HEAD_FIELDS) {
    if (input[field] === undefined) continue;
    const value = text(input[field]);
    if (value === undefined) return { error: `${field} must be text.` };
    if (value.length > MAX_LINE) return { error: `${field} is longer than ${MAX_LINE} characters.` };
    recipe[field] = value;
  }
  if (input.tags !== undefined) {
    const list = input.tags;
    if (!Array.isArray(list) || list.some((x) => typeof x !== "string")) return { error: "tags must be a list of words." };
    recipe.tags = [...new Set((list as string[]).map((x) => x.trim()).filter(Boolean))];
  }
  const rows = (field: "ingredients" | "sections") => {
    const list = input[field] ?? [];
    return Array.isArray(list) && list.length <= MAX_ROWS ? list : undefined;
  };
  const ingredients = rows("ingredients"), sections = rows("sections");
  if (!ingredients) return { error: `ingredients must be a list of at most ${MAX_ROWS}.` };
  if (!sections) return { error: `sections must be a list of at most ${MAX_ROWS}.` };
  for (const [i, row] of ingredients.entries()) {
    const line = isObject(row) ? text(row.text) : undefined;
    if (!line) return { error: `ingredient ${i + 1} needs its text.` };
    const buy = isObject(row) ? text(row.buy ?? "") : undefined, group = isObject(row) ? text(row.group ?? "") : undefined;
    if (buy === undefined || group === undefined) return { error: `ingredient ${i + 1}: buy and group must be text.` };
    if (line.length > MAX_LINE || buy.length > MAX_LINE || group.length > MAX_LINE) return { error: `ingredient ${i + 1} is too long.` };
    recipe.ingredients.push({ group, text: line, buy });
  }
  for (const [i, row] of sections.entries()) {
    const title = isObject(row) ? text(row.title) : undefined;
    if (!title) return { error: `section ${i + 1} needs a title.` };
    const body = isObject(row) && typeof (row.body ?? "") === "string" ? String(row.body ?? "").replace(/\s+$/, "") : undefined;
    if (body === undefined) return { error: `section ${i + 1}: body must be text.` };
    if (title.length > MAX_NAME || body.length > MAX_BODY) return { error: `section ${i + 1} is too long.` };
    recipe.sections.push({ title, body });
  }
  return recipe;
}

const typicalMealIds = () => inUse(getOnlyDay()).meals;

type MealRow = { id: number; name: string; summary: string; serves: string; active_time: string; total_time: string; tags: string };

export function getRecipe(id: number): Recipe | undefined {
  const db = getDb();
  const row = db.prepare("SELECT id, name, summary, serves, active_time, total_time, tags FROM meals WHERE id = ?").get(id) as MealRow | undefined;
  if (!row) return undefined;
  const ingredients = db.prepare("SELECT group_name AS \"group\", text, buy FROM meal_lines WHERE meal_id = ? ORDER BY position").all(id) as unknown as RecipeIngredient[];
  const sections = db.prepare("SELECT title, body FROM meal_sections WHERE meal_id = ? ORDER BY position").all(id) as unknown as RecipeSection[];
  return {
    id: row.id, name: row.name, summary: row.summary, serves: row.serves, activeTime: row.active_time, totalTime: row.total_time,
    tags: JSON.parse(row.tags) as string[], ingredients: ingredients.map((i) => ({ ...i })), sections: sections.map((s) => ({ ...s })),
    typical: typicalMealIds().has(id),
  };
}

export function findRecipe(name: string): Recipe | undefined {
  const row = getDb().prepare("SELECT id FROM meals WHERE name = ? COLLATE NOCASE").get(name.trim()) as { id: number } | undefined;
  return row && getRecipe(row.id);
}

// Nothing written about how the meal is cooked yet.
export function isBlank(recipe: RecipeInput): boolean {
  return !recipe.summary && !recipe.serves && !recipe.activeTime && !recipe.totalTime && recipe.tags.length === 0
    && recipe.ingredients.length === 0 && recipe.sections.length === 0;
}

// The recipe as it would be sent in: what the API returns for editing and what an import file holds.
export function exportRecipe(recipe: Recipe): RecipeInput {
  const { id: _id, typical: _typical, ...input } = recipe;
  return input;
}

// The meals that say how they're cooked; a meal that is only a list of counted ingredients (a shake, a bar) isn't a recipe.
export function listRecipes(): RecipeRow[] {
  const typical = typicalMealIds();
  const rows = getDb().prepare(`SELECT id, name, summary, tags FROM meals m
    WHERE summary != '' OR serves != '' OR active_time != '' OR total_time != '' OR tags != '[]'
      OR EXISTS (SELECT 1 FROM meal_lines WHERE meal_id = m.id) OR EXISTS (SELECT 1 FROM meal_sections WHERE meal_id = m.id)
    ORDER BY name COLLATE NOCASE`).all() as { id: number; name: string; summary: string; tags: string }[];
  return rows.map((r) => ({ id: r.id, name: r.name, summary: r.summary, tags: JSON.parse(r.tags) as string[], typical: typical.has(r.id) }));
}

// Saves a whole recipe. With an id it replaces that meal's recipe (and may rename the meal); without one it replaces
// the recipe of the meal with that name, or adds a new meal, marked occasional: cooked now and then, in no day yet.
export function saveRecipe(input: RecipeInput, id?: number): { recipe: Recipe } {
  const db = getDb();
  const sameName = db.prepare("SELECT id FROM meals WHERE name = ? COLLATE NOCASE").get(input.name) as { id: number } | undefined;
  if (id !== undefined && sameName && sameName.id !== id) throw new Error(`There is already a meal called ${input.name}.`);
  db.exec("BEGIN");
  try {
    let target = id ?? sameName?.id;
    const head = [input.summary, input.serves, input.activeTime, input.totalTime, JSON.stringify(input.tags)];
    if (target === undefined) {
      target = Number(db.prepare("INSERT INTO meals (name, status, occasional, summary, serves, active_time, total_time, tags) VALUES (?, 'approved', 1, ?, ?, ?, ?, ?)").run(input.name, ...head).lastInsertRowid);
    } else {
      // Saved by name, the meal keeps the name it has (the match ignores case); only a save by id renames it.
      const name = id === undefined ? null : input.name;
      const changed = db.prepare("UPDATE meals SET name = COALESCE(?, name), summary = ?, serves = ?, active_time = ?, total_time = ?, tags = ? WHERE id = ?").run(name, ...head, target).changes;
      if (changed === 0) throw new Error("No meal with that id.");
      for (const t of ["meal_lines", "meal_sections"]) db.prepare(`DELETE FROM ${t} WHERE meal_id = ?`).run(target);
    }
    input.ingredients.forEach((i, position) =>
      db.prepare("INSERT INTO meal_lines (meal_id, position, group_name, text, buy) VALUES (?, ?, ?, ?, ?)").run(target!, position, i.group, i.text, i.buy));
    input.sections.forEach((s, position) =>
      db.prepare("INSERT INTO meal_sections (meal_id, position, title, body) VALUES (?, ?, ?, ?)").run(target!, position, s.title, s.body));
    db.exec("COMMIT");
    return { recipe: getRecipe(target)! };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// What a shopping item is for, when it's added without a reason: the typical meals whose recipe lists it as something to buy.
export function recipesUsing(itemName: string): string[] {
  const wanted = buyName(itemName);
  if (!wanted) return [];
  const rows = getDb().prepare(`SELECT m.id, m.name, l.buy FROM meal_lines l JOIN meals m ON m.id = l.meal_id
    WHERE l.buy != '' ORDER BY m.name COLLATE NOCASE`).all() as { id: number; name: string; buy: string }[];
  const using = rows.filter((r) => r.buy.split(";").some((name) => buyName(name) === wanted));
  if (using.length === 0) return [];
  const typical = typicalMealIds();
  return [...new Set(using.filter((r) => typical.has(r.id)).map((r) => r.name))].slice(0, MAX_FILLED);
}
