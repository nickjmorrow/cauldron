// Loads recipes from a JSON file into the app database. Safe to re-run: a recipe of the same name is replaced.
// Usage: npm run import-recipes -- path/to/recipes.json
// The file is a list of recipes (or {"recipes": [...]}), each in the shape GET /api/recipes/<id> returns:
//   { "name": "...", "summary": "", "serves": "", "activeTime": "", "totalTime": "", "tags": ["dinner"],
//     "ingredients": [{ "group": "", "text": "2 Tbsp olive oil", "buy": "olive oil" }],
//     "sections": [{ "title": "instructions", "body": "- Step one\n  - A detail" }],
//     "meals": ["Names of meals it belongs to"] }
import { readFileSync } from "node:fs";
import { parseRecipe, saveRecipe } from "../lib/recipes.ts";

const path = process.argv[2];
if (!path) {
  console.error("Say which file to import: npm run import-recipes -- path/to/recipes.json");
  process.exit(1);
}
const file = JSON.parse(readFileSync(path, "utf8")) as unknown;
const list = Array.isArray(file) ? file : (file as { recipes?: unknown })?.recipes;
if (!Array.isArray(list)) {
  console.error('The file must hold a list of recipes, or {"recipes": [...]}.');
  process.exit(1);
}

let saved = 0, failed = 0;
for (const [i, entry] of list.entries()) {
  const recipe = parseRecipe(entry);
  if ("error" in recipe) {
    failed++;
    console.error(`Skipped recipe ${i + 1} (${(entry as { name?: unknown })?.name ?? "no name"}): ${recipe.error}`);
    continue;
  }
  const { unknownMeals } = saveRecipe(recipe);
  saved++;
  if (unknownMeals.length > 0) console.warn(`${recipe.name}: no meal called ${unknownMeals.join(", ")}; not linked.`);
}
console.log(`Imported ${saved} of ${list.length} recipes${failed ? `; ${failed} skipped` : ""}.`);
process.exit(failed ? 1 : 0);
