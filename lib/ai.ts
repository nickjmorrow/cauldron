import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { getDb } from "./db.ts";
import { looksDairy } from "./compute.ts";
import { searchUsda } from "./usda.ts";
import { dayIngredients, getDay, getOnlyDay, listIngredients, listLocations, listMeals, listPlacements, STUB_SERVING } from "./queries.ts";
import { likeFood, validLikes, type LikesDraft } from "./likes.ts";
import { validPlacements, type PlacementDraft } from "./placements.ts";

const run = promisify(execFile);
const SYSTEM = "You output only a single JSON object, no prose, no code fences. All food suggestions must be dairy-free (no milk, cheese, butter, cream, yogurt, whey, casein, ghee).";

async function askJson<T>(prompt: string): Promise<T> {
  const { stdout } = await run(
    "claude",
    ["-p", prompt, "--output-format", "json", "--tools", "", "--strict-mcp-config", "--disable-slash-commands",
      "--setting-sources", "", "--no-session-persistence", "--system-prompt", SYSTEM, "--model", "sonnet"],
    { cwd: "data", maxBuffer: 10 * 1024 * 1024, timeout: 120_000 },
  );
  const reply = JSON.parse(stdout) as { result: string; is_error: boolean };
  if (reply.is_error) throw new Error(`claude failed: ${reply.result}`);
  const body = reply.result.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  return JSON.parse(body) as T;
}

export type ProposalResult = { added: string[]; skipped: string[] };

// Ask for generic ingredient search terms, look each up in USDA, store the best hit as proposed.
export async function proposeIngredients(request: string): Promise<ProposalResult> {
  const { queries } = await askJson<{ queries: string[] }>(
    `The user wants ingredient ideas: "${request}". Return {"queries": [...]} with up to 6 USDA FoodData Central search terms for specific, generic, dairy-free ingredients (cooked or raw as typically eaten), e.g. "salmon atlantic cooked".`,
  );
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO ingredients (name, serving, source, fdc_id, contains_dairy, status, nutrients)
     VALUES (?, '100 g', ?, ?, 0, 'proposed', ?)`,
  );
  const result: ProposalResult = { added: [], skipped: [] };
  for (const query of queries.slice(0, 6)) {
    const hit = (await searchUsda(query, 3)).find((c) => !c.contains_dairy);
    if (!hit) { result.skipped.push(`${query} (no dairy-free match)`); continue; }
    const exists = db.prepare("SELECT 1 FROM ingredients WHERE name = ? OR fdc_id = ?").get(hit.name, hit.fdcId);
    if (exists) { result.skipped.push(`${hit.name} (already have it)`); continue; }
    insert.run(hit.name, `USDA FoodData Central (FDC ID ${hit.fdcId}); per 100 g`, hit.fdcId, JSON.stringify(hit.nutrients));
    result.added.push(hit.name);
  }
  return result;
}

type MealDraft = { name: string; slot?: string; notes?: string; items: { ingredient: string; qty: number }[] };

// Meals may only use approved, dairy-free ingredients, so every proposed meal has real numbers.
export async function proposeMeal(request: string): Promise<ProposalResult> {
  const usable = listIngredients("approved").filter((i) => !i.contains_dairy && i.serving !== "1 meal");
  const draft = await askJson<MealDraft>(
    `Design one meal for: "${request}". Use ONLY these ingredients (name | serving; qty is a number of servings):\n${usable.map((i) => `${i.name} | ${i.serving}`).join("\n")}\n` +
      `Return {"name": string, "slot": "Breakfast|Lunch|Dinner|Snack", "notes": "short how-to", "items": [{"ingredient": exact name, "qty": number}]}.`,
  );
  const byName = new Map(usable.map((i) => [i.name, i]));
  const items = draft.items.filter((i) => byName.has(i.ingredient) && i.qty > 0);
  if (!draft.name || !items.length) throw new Error("The draft used no known ingredients; nothing was added.");
  const db = getDb();
  const meal = db.prepare("INSERT INTO meals (name, typical_slot, source, notes, status) VALUES (?, ?, 'AI proposal', ?, 'proposed')")
    .run(draft.name, draft.slot ?? "", draft.notes ?? "");
  const add = db.prepare("INSERT OR REPLACE INTO meal_items (meal_id, ingredient_id, qty) VALUES (?, ?, ?)");
  for (const i of items) add.run(Number(meal.lastInsertRowid), byName.get(i.ingredient)!.id, i.qty);
  const dropped = draft.items.length - items.length;
  return { added: [draft.name], skipped: dropped ? [`${dropped} ingredient(s) not in your approved list`] : [] };
}

// Turns "I eat eggs and toast for breakfast, rice bowls for lunch" into liked foods per meal, as proposals to approve.
// The AI only maps words to foods you already have; it does no arithmetic and adds nothing that isn't approved and dairy-free.
export async function proposeLikes(text: string): Promise<ProposalResult> {
  const slotNames = getOnlyDay().slots.map((s) => s.name);
  if (!slotNames.length) throw new Error("Add some meals to your base day first, so there are meals to attach foods to.");
  const ingredients = listIngredients("approved").filter((i) => !i.contains_dairy && i.serving !== STUB_SERVING);
  const draft = await askJson<LikesDraft>(
    `The user says what they eat or like: "${text}". Match it to their meals of the day: ${slotNames.map((n) => `"${n}"`).join(", ")}. ` +
      `Use ONLY these foods, with their exact names: ${ingredients.map((i) => i.name).join(" | ")}. ` +
      `If they mention a food that is not in that list, still include its plain name in "foods" so it can be reported. ` +
      `Return {"likes": [{"slot": exact meal name, "foods": [food names]}]}.`,
  );
  const { pairs, unmatched } = validLikes(draft, ingredients.map((i) => ({ id: i.id, name: i.name })), slotNames);
  const names = new Map(ingredients.map((i) => [i.id, i.name]));
  const added: string[] = [];
  for (const p of pairs) {
    if (likeFood(p.ingredientId, p.slotName, "proposed") === null) added.push(`${names.get(p.ingredientId)} for ${p.slotName}`);
  }
  return { added, skipped: unmatched.map((u) => `${u} (not one of your foods yet)`) };
}

export type PlacementResult = { placed: number; ingredients: number; alreadyPlaced: number; unmatched: string[] };

// Proposes a kitchen area (rarely two) for each ingredient in the chosen days' meals that has no place yet.
export async function proposePlacements(dayIds: number[]): Promise<PlacementResult> {
  const days = dayIds.map(getDay).filter((d) => d !== undefined);
  if (!days.length) throw new Error("Pick at least one day.");
  const areas = listLocations();
  if (!areas.length) throw new Error("Add your kitchen areas first (Kitchen page); the AI only picks from areas you named.");
  const placedIds = new Set(listPlacements().map((p) => p.ingredient_id));
  const all = [...new Map(days.flatMap(dayIngredients).map((i) => [i.id, i])).values()].sort((a, b) => a.name.localeCompare(b.name));
  const todo = all.filter((i) => !placedIds.has(i.id));
  const result: PlacementResult = { placed: 0, ingredients: todo.length, alreadyPlaced: all.length - todo.length, unmatched: [] };
  if (!todo.length) return result;

  const draft = await askJson<PlacementDraft>(
    `The user stores food in these kitchen areas: ${areas.map((a) => `"${a.name}"`).join(", ")}.\n` +
      `For each ingredient below, pick the one area where it is best stored (pick two only if it is commonly split, e.g. bread in the pantry and freezer). ` +
      `Use only the area names above, exactly as written, and only the ingredient names below.\n${todo.map((i) => `${i.name} | ${i.serving}`).join("\n")}\n` +
      `Return {"placements": [{"ingredient": exact name, "areas": [exact area names]}]}.`,
  );
  const { pairs, unmatched } = validPlacements(draft, new Map(todo.map((i) => [i.name, i.id])), new Map(areas.map((a) => [a.name, a.id])));
  const insert = getDb().prepare("INSERT OR IGNORE INTO ingredient_locations (ingredient_id, location_id, status) VALUES (?, ?, 'proposed')");
  for (const p of pairs) result.placed += Number(insert.run(p.ingredientId, p.locationId).changes);
  result.unmatched = unmatched;
  return result;
}

export { looksDairy };
