// Recipes: the things that get cooked and shopped for. A recipe has a list of ingredients (each line as written, plus
// what to buy for it), free-text sections (instructions, log, storage...) and the meals it belongs to. Meals carry the
// nutrition; a recipe never feeds totals. A recipe is typical when one of its meals is in the typical day, and typical
// recipes are what a shopping item is "for" when it's added without a reason.
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
  ingredients: RecipeIngredient[]; sections: RecipeSection[]; meals: string[]; // meals by name
};
export type Recipe = RecipeInput & { id: number; typical: boolean };
export type RecipeRow = { id: number; name: string; summary: string; tags: string[]; typical: boolean; meals: string[] };

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
  const recipe: RecipeInput = { name, summary: "", serves: "", activeTime: "", totalTime: "", tags: [], ingredients: [], sections: [], meals: [] };
  for (const field of HEAD_FIELDS) {
    if (input[field] === undefined) continue;
    const value = text(input[field]);
    if (value === undefined) return { error: `${field} must be text.` };
    if (value.length > MAX_LINE) return { error: `${field} is longer than ${MAX_LINE} characters.` };
    recipe[field] = value;
  }
  for (const field of ["tags", "meals"] as const) {
    if (input[field] === undefined) continue;
    const list = input[field];
    if (!Array.isArray(list) || list.some((x) => typeof x !== "string")) {
      return { error: field === "tags" ? "tags must be a list of words." : "meals must be a list of meal names." };
    }
    recipe[field] = [...new Set((list as string[]).map((x) => x.trim()).filter(Boolean))];
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

function typicalRecipeIds(): Set<number> {
  const meals = inUse(getOnlyDay()).meals;
  const rows = getDb().prepare("SELECT recipe_id, meal_id FROM meal_recipes").all() as { recipe_id: number; meal_id: number }[];
  return new Set(rows.filter((r) => meals.has(r.meal_id)).map((r) => r.recipe_id));
}

const mealNames = (id: number) =>
  (getDb().prepare("SELECT m.name FROM meal_recipes mr JOIN meals m ON m.id = mr.meal_id WHERE mr.recipe_id = ? ORDER BY m.name COLLATE NOCASE").all(id) as { name: string }[]).map((r) => r.name);

export function getRecipe(id: number): Recipe | undefined {
  const db = getDb();
  const row = db.prepare("SELECT * FROM recipes WHERE id = ?").get(id) as
    { id: number; name: string; summary: string; serves: string; active_time: string; total_time: string; tags: string } | undefined;
  if (!row) return undefined;
  const ingredients = db.prepare("SELECT group_name AS \"group\", text, buy FROM recipe_ingredients WHERE recipe_id = ? ORDER BY position").all(id) as unknown as RecipeIngredient[];
  const sections = db.prepare("SELECT title, body FROM recipe_sections WHERE recipe_id = ? ORDER BY position").all(id) as unknown as RecipeSection[];
  return {
    id: row.id, name: row.name, summary: row.summary, serves: row.serves, activeTime: row.active_time, totalTime: row.total_time,
    tags: JSON.parse(row.tags) as string[], ingredients: ingredients.map((i) => ({ ...i })), sections: sections.map((s) => ({ ...s })),
    meals: mealNames(id), typical: typicalRecipeIds().has(id),
  };
}

export function findRecipe(name: string): Recipe | undefined {
  const row = getDb().prepare("SELECT id FROM recipes WHERE name = ? COLLATE NOCASE").get(name.trim()) as { id: number } | undefined;
  return row && getRecipe(row.id);
}

// The recipe as it would be sent in: what the API returns for editing and what an import file holds.
export function exportRecipe(recipe: Recipe): RecipeInput {
  const { id: _id, typical: _typical, ...input } = recipe;
  return input;
}

export function listRecipes(): RecipeRow[] {
  const typical = typicalRecipeIds();
  const rows = getDb().prepare("SELECT id, name, summary, tags FROM recipes ORDER BY name COLLATE NOCASE").all() as { id: number; name: string; summary: string; tags: string }[];
  return rows.map((r) => ({ id: r.id, name: r.name, summary: r.summary, tags: JSON.parse(r.tags) as string[], typical: typical.has(r.id), meals: mealNames(r.id) }));
}

// Saves a whole recipe. With an id it replaces that recipe (and may rename it); without one it replaces the recipe of
// the same name, or adds a new one. Meals are linked by name; names that match no meal are returned, not linked.
export function saveRecipe(input: RecipeInput, id?: number): { recipe: Recipe; unknownMeals: string[] } {
  const db = getDb();
  const sameName = db.prepare("SELECT id FROM recipes WHERE name = ? COLLATE NOCASE").get(input.name) as { id: number } | undefined;
  if (id !== undefined && sameName && sameName.id !== id) throw new Error(`There is already a recipe called ${input.name}.`);
  const unknownMeals: string[] = [];
  db.exec("BEGIN");
  try {
    let target = id ?? sameName?.id;
    const head = [input.name, input.summary, input.serves, input.activeTime, input.totalTime, JSON.stringify(input.tags)];
    if (target === undefined) {
      target = Number(db.prepare("INSERT INTO recipes (name, summary, serves, active_time, total_time, tags) VALUES (?, ?, ?, ?, ?, ?)").run(...head).lastInsertRowid);
    } else {
      const changed = db.prepare("UPDATE recipes SET name = ?, summary = ?, serves = ?, active_time = ?, total_time = ?, tags = ? WHERE id = ?").run(...head, target).changes;
      if (changed === 0) throw new Error("No recipe with that id.");
      for (const t of ["recipe_ingredients", "recipe_sections", "meal_recipes"]) db.prepare(`DELETE FROM ${t} WHERE recipe_id = ?`).run(target);
    }
    input.ingredients.forEach((i, position) =>
      db.prepare("INSERT INTO recipe_ingredients (recipe_id, position, group_name, text, buy) VALUES (?, ?, ?, ?, ?)").run(target!, position, i.group, i.text, i.buy));
    input.sections.forEach((s, position) =>
      db.prepare("INSERT INTO recipe_sections (recipe_id, position, title, body) VALUES (?, ?, ?, ?)").run(target!, position, s.title, s.body));
    for (const name of input.meals) {
      const meal = db.prepare("SELECT id FROM meals WHERE name = ? COLLATE NOCASE").get(name) as { id: number } | undefined;
      if (!meal) { unknownMeals.push(name); continue; }
      db.prepare("INSERT OR IGNORE INTO meal_recipes (meal_id, recipe_id) VALUES (?, ?)").run(meal.id, target);
    }
    db.exec("COMMIT");
    return { recipe: getRecipe(target)!, unknownMeals };
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function deleteRecipe(id: number): boolean {
  return getDb().prepare("DELETE FROM recipes WHERE id = ?").run(id).changes > 0;
}

// The recipes a meal belongs to, for the meal's page.
export function recipesOfMeal(mealId: number): { id: number; name: string }[] {
  return getDb().prepare("SELECT r.id, r.name FROM meal_recipes mr JOIN recipes r ON r.id = mr.recipe_id WHERE mr.meal_id = ? ORDER BY r.name COLLATE NOCASE").all(mealId) as { id: number; name: string }[];
}

// What a shopping item is for, when it's added without a reason: the typical recipes that list it as something to buy.
export function recipesUsing(itemName: string): string[] {
  const wanted = buyName(itemName);
  if (!wanted) return [];
  const rows = getDb().prepare(`SELECT r.id, r.name, ri.buy FROM recipe_ingredients ri JOIN recipes r ON r.id = ri.recipe_id
    WHERE ri.buy != '' ORDER BY r.name COLLATE NOCASE`).all() as { id: number; name: string; buy: string }[];
  const using = rows.filter((r) => r.buy.split(";").some((name) => buyName(name) === wanted));
  if (using.length === 0) return [];
  const typical = typicalRecipeIds();
  return [...new Set(using.filter((r) => typical.has(r.id)).map((r) => r.name))].slice(0, MAX_FILLED);
}
