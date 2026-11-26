import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

// Own database file, so the real one is never touched.
const FILE = "data/test-recipes.db";
process.env.CAULDRON_DB = FILE;
const { getDb } = await import("./db.ts");
const { parseRecipe, saveRecipe, getRecipe, findRecipe, listRecipes, recipesUsing, buyName, exportRecipe, isBlank } = await import("./recipes.ts");

test.after(() => { for (const ext of ["", "-wal", "-shm"]) rmSync(FILE + ext, { force: true }); });

const db = getDb();
const id = (sql: string, ...args: (string | number)[]) => Number(db.prepare(sql).run(...args).lastInsertRowid);
const day = id("INSERT INTO days (name, position) VALUES ('Standard day', 1)");
const slot = id("INSERT INTO day_slots (day_id, name, position) VALUES (?, 'Dinner', 1)", day);
const meal = (name: string, typical: boolean) => {
  const m = id("INSERT INTO meals (name, status) VALUES (?, 'approved')", name);
  if (typical) db.prepare("INSERT INTO slot_options (slot_id, meal_id, is_planned) VALUES (?, ?, 1)").run(slot, m);
  return m;
};
meal("Ginger Sauce", true);
meal("Leek Soup", true);
meal("Roast", false);
meal("Shake", true);

const sauce = {
  name: "Ginger Sauce", summary: "A jar sauce.", serves: "8", activeTime: "~5 min", totalTime: "~5 min", tags: ["sauce", "dinner"],
  ingredients: [
    { group: "", text: "1/2 cup low-sodium soy sauce", buy: "low-sodium soy sauce" },
    { group: "", text: "2 Tbsp water", buy: "" },
    { group: "", text: "1/2 tsp ground cumin and 1/2 tsp garlic powder", buy: "ground cumin; Garlic powder" },
    { group: "to finish", text: "1/2 tsp sesame seeds, optional", buy: "Sesame seeds" },
  ],
  sections: [{ title: "instructions", body: "- **1. Mix.** Shake it.\n  - Or stir." }, { title: "log", body: "" }],
};

test("a recipe is checked and cleaned on the way in", () => {
  const parsed = parseRecipe({ ...sauce, name: "  Ginger Sauce ", tags: [" sauce ", "sauce", "dinner"], extra: 1 });
  assert.deepEqual(parsed, sauce);
  assert.deepEqual(parseRecipe({ name: "Toast" }), { name: "Toast", summary: "", serves: "", activeTime: "", totalTime: "", tags: [], ingredients: [], sections: [] });
});

test("a bad recipe says what was wrong", () => {
  const error = (input: unknown) => (parseRecipe(input) as { error: string }).error;
  assert.match(error(null), /JSON object/);
  assert.match(error({ summary: "x" }), /needs a name/);
  assert.match(error({ name: " " }), /needs a name/);
  assert.match(error({ name: "x", serves: 8 }), /serves must be text/);
  assert.match(error({ name: "x", tags: "sauce" }), /tags must be a list/);
  assert.match(error({ name: "x", ingredients: [{ buy: "salt" }] }), /ingredient 1 needs its text/);
  assert.match(error({ name: "x", ingredients: ["salt"] }), /ingredient 1/);
  assert.match(error({ name: "x", sections: [{ body: "y" }] }), /section 1 needs a title/);
});

test("a recipe is saved onto the meal of its name, comes back whole and in order, and exports to the shape it was saved from", () => {
  const meal = findRecipe("ginger sauce")!;
  assert.equal(isBlank(meal), true);
  const { recipe } = saveRecipe({ ...sauce, name: "ginger sauce" });
  assert.equal(recipe.id, meal.id);
  assert.deepEqual(exportRecipe(getRecipe(recipe.id)!), sauce); // the meal keeps its own spelling of the name
  assert.equal(isBlank(recipe), false);
});

test("saving a recipe of the same name replaces it", () => {
  const before = findRecipe("Ginger Sauce")!;
  const { recipe } = saveRecipe({ ...sauce, ingredients: [sauce.ingredients[0]], sections: [] });
  assert.equal(recipe.id, before.id);
  assert.deepEqual([recipe.ingredients.length, recipe.sections.length], [1, 0]);
  saveRecipe(sauce);
});

test("a recipe for no meal yet adds an occasional meal with nothing counted", () => {
  const { recipe } = saveRecipe(parseRecipe({ name: "Cookies", ingredients: [{ text: "1 cup sesame seeds", buy: "sesame seeds" }] }) as typeof sauce);
  const meal = db.prepare("SELECT status, occasional FROM meals WHERE id = ?").get(recipe.id);
  assert.deepEqual({ ...meal }, { status: "approved", occasional: 1 });
});

test("a recipe can be saved by id under a new name, which renames the meal, but not under another meal's name", () => {
  const soup = saveRecipe({ ...parseRecipe({ name: "Leek Soup" }) as typeof sauce, ingredients: [{ group: "", text: "3 leeks", buy: "leeks" }] }).recipe;
  assert.equal(saveRecipe({ ...exportRecipe(soup), name: "Leek and Potato Soup" }, soup.id).recipe.name, "Leek and Potato Soup");
  assert.throws(() => saveRecipe({ ...exportRecipe(soup), name: "Ginger Sauce" }, soup.id), /already a meal/);
  assert.throws(() => saveRecipe(sauce, 9999), /already a meal/);
  assert.throws(() => saveRecipe({ ...sauce, name: "Nobody" }, 9999), /No meal with that id/);
  saveRecipe({ ...exportRecipe(soup), name: "Leek Soup" }, soup.id);
});

test("the list holds the meals that say how they're cooked, and which of them are typical", () => {
  saveRecipe({ ...(parseRecipe({ name: "Roast" }) as typeof sauce), ingredients: [{ group: "", text: "leeks, a few", buy: "leek" }] });
  assert.deepEqual(listRecipes().map((r) => [r.name, r.typical]), [["Cookies", false], ["Ginger Sauce", true], ["Leek Soup", true], ["Roast", false]]); // no Shake
});

test("an item is for the typical recipes that list it as something to buy, and no others", () => {
  assert.equal(buyName("Rice vinegar, unseasoned"), "rice vinegar");
  assert.deepEqual(recipesUsing("Sesame seeds"), ["Ginger Sauce"]);        // Cookies uses them too, but isn't typical
  assert.deepEqual(recipesUsing("Leek"), ["Leek Soup"]);                   // Roast isn't typical
  assert.deepEqual(recipesUsing("low-sodium soy sauce (the green cap)"), ["Ginger Sauce"]);
  assert.deepEqual(recipesUsing("garlic powder"), ["Ginger Sauce"]);        // the second thing on a line that holds two
  assert.deepEqual(recipesUsing("Water"), []);                             // listed, but nothing to buy
  assert.deepEqual(recipesUsing("Soy sauce"), []);
  assert.deepEqual(recipesUsing(""), []);
});

test("deleting a meal takes its recipe with it", () => {
  const roast = findRecipe("Roast")!;
  db.prepare("DELETE FROM meals WHERE id = ?").run(roast.id);
  assert.equal(getRecipe(roast.id), undefined);
  for (const t of ["meal_lines", "meal_sections"]) {
    assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE meal_id = ?`).get(roast.id) as { n: number }).n, 0);
  }
});

// What the database held when recipes were their own thing, linked to meals.
const OLD_TABLES = `
CREATE TABLE recipes (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE COLLATE NOCASE, summary TEXT NOT NULL DEFAULT '', serves TEXT NOT NULL DEFAULT '',
  active_time TEXT NOT NULL DEFAULT '', total_time TEXT NOT NULL DEFAULT '', tags TEXT NOT NULL DEFAULT '[]');
CREATE TABLE recipe_ingredients (id INTEGER PRIMARY KEY, recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, position INTEGER NOT NULL,
  group_name TEXT NOT NULL DEFAULT '', text TEXT NOT NULL, buy TEXT NOT NULL DEFAULT '');
CREATE TABLE recipe_sections (id INTEGER PRIMARY KEY, recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE, position INTEGER NOT NULL,
  title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '');
CREATE TABLE meal_recipes (meal_id INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE, recipe_id INTEGER NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  PRIMARY KEY (meal_id, recipe_id));`;

test("recipes that were their own thing move onto their meals", async () => {
  const { mergeRecipes } = await import("./db.ts");
  db.exec("DELETE FROM meal_lines; DELETE FROM meal_sections; DELETE FROM slot_options; DELETE FROM meals;");
  db.exec(OLD_TABLES);
  const thighs = meal("Chicken Thighs", true), rice = meal("Rice", true), potatoes = meal("Potatoes", true);
  meal("pancakes", false);
  const recipe = (name: string, summary: string, tags: string[], line: string, body: string, meals: number[]) => {
    const r = id("INSERT INTO recipes (name, summary, serves, tags) VALUES (?, ?, '2', ?)", name, summary, JSON.stringify(tags));
    db.prepare("INSERT INTO recipe_ingredients (recipe_id, position, text, buy) VALUES (?, 0, ?, ?)").run(r, line, line);
    db.prepare("INSERT INTO recipe_sections (recipe_id, position, title, body) VALUES (?, 0, 'related', ?)").run(r, body);
    for (const m of meals) db.prepare("INSERT INTO meal_recipes (meal_id, recipe_id) VALUES (?, ?)").run(m, r);
  };
  recipe("Lime Chicken", "Sheet-pan thighs.", ["dinner"], "chicken thighs", "- [[starches]]\n- [[Pancakes]]", [thighs]);
  recipe("Starches", "Pick one.", ["side"], "rice; potatoes", "- [[lime chicken]] and [[Trifle]]", [rice, potatoes]);
  recipe("Pancakes", "Sunday ones.", [], "flour", "- none", []);       // no meal, but one of the same name
  recipe("Trifle", "Layers.", ["dessert"], "custard", "- [[nothing here]]", []); // no meal at all
  db.prepare("INSERT INTO shopping_items (name, meals) VALUES ('Limes', ?), ('Rice', ?), ('Soap', ?)").run('["Lime Chicken","Party"]', '["starches"]', '["House"]');
  db.prepare("INSERT INTO shopping_hidden (reason) VALUES ('Lime Chicken'), ('House')").run();

  mergeRecipes(db);
  mergeRecipes(db); // nothing left to move

  const moved = findRecipe("Chicken Thighs")!;
  assert.deepEqual([moved.summary, moved.serves, moved.tags, moved.ingredients[0].text, moved.typical], ["Sheet-pan thighs.", "2", ["dinner"], "chicken thighs", true]);
  assert.equal(moved.sections[0].body, "- [[starches]]\n- [[pancakes]]"); // Starches became two meals, so it stays as written
  for (const name of ["Rice", "Potatoes"]) {
    const side = findRecipe(name)!;
    assert.deepEqual([side.summary, side.ingredients[0].buy, side.sections[0].body], ["Pick one.", "rice; potatoes", "- [[Chicken Thighs]] and [[Trifle]]"]);
  }
  assert.equal(findRecipe("Pancakes")!.summary, "Sunday ones.");
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM meals WHERE name = 'pancakes' COLLATE NOCASE").get() as { n: number }).n, 1);
  const trifle = db.prepare("SELECT status, occasional, tags FROM meals WHERE name = 'Trifle'").get();
  assert.deepEqual({ ...trifle }, { status: "approved", occasional: 1, tags: '["dessert"]' });
  const reasons = (name: string) => JSON.parse((db.prepare("SELECT meals FROM shopping_items WHERE name = ?").get(name) as { meals: string }).meals);
  assert.deepEqual([reasons("Limes"), reasons("Rice"), reasons("Soap")], [["Chicken Thighs", "Party"], ["Rice", "Potatoes"], ["House"]]);
  assert.deepEqual((db.prepare("SELECT reason FROM shopping_hidden ORDER BY reason").all() as { reason: string }[]).map((r) => r.reason), ["Chicken Thighs", "House"]);
  assert.equal(db.prepare("SELECT 1 FROM sqlite_master WHERE name IN ('recipes', 'recipe_ingredients', 'recipe_sections', 'meal_recipes')").get(), undefined);
});
