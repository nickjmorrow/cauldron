import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

// Own database file, so the real one is never touched.
const FILE = "data/test-recipes.db";
process.env.CAULDRON_DB = FILE;
const { getDb } = await import("./db.ts");
const { parseRecipe, saveRecipe, getRecipe, findRecipe, listRecipes, deleteRecipe, recipesUsing, buyName, exportRecipe } = await import("./recipes.ts");

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
meal("Leek Soup & Bread", true);
meal("Holiday Roast", false);

const sauce = {
  name: "Ginger Sauce", summary: "A jar sauce.", serves: "8", activeTime: "~5 min", totalTime: "~5 min", tags: ["sauce", "dinner"],
  ingredients: [
    { group: "", text: "1/2 cup low-sodium soy sauce", buy: "low-sodium soy sauce" },
    { group: "", text: "2 Tbsp water", buy: "" },
    { group: "", text: "1/2 tsp ground cumin and 1/2 tsp garlic powder", buy: "ground cumin; Garlic powder" },
    { group: "to finish", text: "1/2 tsp sesame seeds, optional", buy: "Sesame seeds" },
  ],
  sections: [{ title: "instructions", body: "- **1. Mix.** Shake it.\n  - Or stir." }, { title: "log", body: "" }],
  meals: ["Ginger Sauce"],
};

test("a recipe is checked and cleaned on the way in", () => {
  const parsed = parseRecipe({ ...sauce, name: "  Ginger Sauce ", tags: [" sauce ", "sauce", "dinner"], extra: 1 });
  assert.deepEqual(parsed, sauce);
  assert.deepEqual(parseRecipe({ name: "Toast" }), { name: "Toast", summary: "", serves: "", activeTime: "", totalTime: "", tags: [], ingredients: [], sections: [], meals: [] });
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
  assert.match(error({ name: "x", meals: [3] }), /meals must be a list of meal names/);
});

test("a saved recipe comes back whole, in order, and exports to the shape it was saved from", () => {
  const { recipe, unknownMeals } = saveRecipe(sauce);
  assert.deepEqual(unknownMeals, []);
  assert.deepEqual(exportRecipe(getRecipe(recipe.id)!), sauce);
  assert.equal(findRecipe("ginger sauce")!.id, recipe.id);
});

test("saving a recipe of the same name replaces it; a meal that doesn't exist is reported, not linked", () => {
  const before = findRecipe("Ginger Sauce")!;
  const { recipe, unknownMeals } = saveRecipe({ ...sauce, ingredients: [sauce.ingredients[0]], sections: [], meals: ["Ginger Sauce", "No Such Meal"] });
  assert.equal(recipe.id, before.id);
  assert.deepEqual(unknownMeals, ["No Such Meal"]);
  assert.deepEqual([recipe.ingredients.length, recipe.sections.length, recipe.meals], [1, 0, ["Ginger Sauce"]]);
  saveRecipe(sauce);
});

test("a recipe can be saved by id under a new name, but not under another recipe's name", () => {
  const soup = saveRecipe({ ...parseRecipe({ name: "Leek Soup" }) as typeof sauce, meals: ["Leek Soup & Bread"], ingredients: [{ group: "", text: "3 leeks", buy: "leeks" }] }).recipe;
  assert.equal(saveRecipe({ ...exportRecipe(soup), name: "Leek and Potato Soup" }, soup.id).recipe.name, "Leek and Potato Soup");
  assert.throws(() => saveRecipe({ ...exportRecipe(soup), name: "Ginger Sauce" }, soup.id), /already a recipe/);
  saveRecipe({ ...exportRecipe(soup), name: "Leek Soup" }, soup.id);
});

test("the list says which recipes are typical: the ones with a meal in the typical day", () => {
  saveRecipe({ ...(parseRecipe({ name: "Roast" }) as typeof sauce), meals: ["Holiday Roast"], ingredients: [{ group: "", text: "leeks, a few", buy: "leek" }] });
  saveRecipe(parseRecipe({ name: "Cookies", ingredients: [{ text: "1 cup sesame seeds", buy: "sesame seeds" }] }) as typeof sauce);
  assert.deepEqual(listRecipes().map((r) => [r.name, r.typical]), [["Cookies", false], ["Ginger Sauce", true], ["Leek Soup", true], ["Roast", false]]);
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

test("a deleted recipe is gone with its ingredients, sections and meal links", () => {
  const roast = findRecipe("Roast")!;
  assert.equal(deleteRecipe(roast.id), true);
  assert.equal(deleteRecipe(roast.id), false);
  assert.equal(getRecipe(roast.id), undefined);
  for (const t of ["recipe_ingredients", "recipe_sections", "meal_recipes"]) {
    assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ${t} WHERE recipe_id = ?`).get(roast.id) as { n: number }).n, 0);
  }
});
