// One-time import of a diet spreadsheet (read-only) into the app database.
// Usage: npm run import -- path/to/diet.xlsx (or set CAULDRON_XLSX; default data/diet.xlsx).
import ExcelJS from "exceljs";
import { getDb } from "../lib/db.ts";
import { NUTRIENTS, type Nutrients } from "../lib/nutrients.ts";
import { looksDairy } from "../lib/compute.ts";

const XLSX_PATH = process.argv[2] ?? process.env.CAULDRON_XLSX ?? "data/diet.xlsx";
const FDC_ID = /FDC ID (\d+)/;

const cellValue = (v: ExcelJS.CellValue): unknown =>
  v && typeof v === "object" ? ("result" in v ? v.result : "text" in v ? v.text : null) : v;
const text = (v: ExcelJS.CellValue) => String(cellValue(v) ?? "").trim();
const num = (v: ExcelJS.CellValue): number | null => {
  const x = cellValue(v);
  return typeof x === "number" ? x : null;
};

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(XLSX_PATH);
const db = getDb();
// Replacing the base slots cascades to every version's adjustments, so never import over a database that has any.
const adjustments = (db.prepare("SELECT COUNT(*) AS n FROM version_adjustments").get() as { n: number }).n;
if (adjustments > 0) {
  console.error(`Refusing to import: this database has ${adjustments} version adjustments that the import would wipe. Import into a new file with CAULDRON_DB instead.`);
  process.exit(1);
}
db.exec("BEGIN");

// Foods: header row 4, nutrients in columns 4.. in NUTRIENTS order.
const foods = wb.getWorksheet("Foods")!;
const insertIngredient = db.prepare(
  `INSERT INTO ingredients (name, serving, source, fdc_id, notes, contains_dairy, status, nutrients)
   VALUES (?, ?, ?, ?, ?, ?, 'approved', ?)
   ON CONFLICT(name) DO UPDATE SET serving=excluded.serving, source=excluded.source, fdc_id=excluded.fdc_id,
     notes=excluded.notes, contains_dairy=excluded.contains_dairy, nutrients=excluded.nutrients`,
);
let foodCount = 0;
for (let r = 5; r <= foods.rowCount; r++) {
  const row = foods.getRow(r);
  const name = text(row.getCell(1).value);
  if (!name) continue;
  const nutrients: Nutrients = {};
  NUTRIENTS.forEach(({ key }, i) => {
    const v = num(row.getCell(4 + i).value);
    if (v !== null) nutrients[key] = v;
  });
  const source = text(row.getCell(3).value);
  const notes = text(row.getCell(4 + NUTRIENTS.length).value);
  const fdc = FDC_ID.exec(source)?.[1];
  insertIngredient.run(name, text(row.getCell(2).value), source, fdc ? Number(fdc) : null, notes, looksDairy(name) ? 1 : 0, JSON.stringify(nutrients));
  foodCount++;
}

const ingredientId = db.prepare("SELECT id FROM ingredients WHERE name = ?");
const insertMeal = db.prepare(
  `INSERT INTO meals (name, typical_slot, source, notes, status) VALUES (?, ?, ?, ?, 'approved')
   ON CONFLICT(name) DO UPDATE SET typical_slot=excluded.typical_slot, source=excluded.source, notes=excluded.notes`,
);
const mealId = db.prepare("SELECT id FROM meals WHERE name = ?");
const insertItem = db.prepare(
  "INSERT OR REPLACE INTO meal_items (meal_id, ingredient_id, qty) VALUES (?, ?, ?)",
);
const problems: string[] = [];

// Recipes: "Recipe:" row, header row, ingredient rows (name, qty), TOTAL row.
const recipes = wb.getWorksheet("Recipes")!;
const recipeNotes = new Map<string, string>();
const recipeItems = new Map<string, { ingredient: string; qty: number }[]>();
for (let r = 1; r <= recipes.rowCount; r++) {
  if (text(recipes.getCell(r, 1).value) !== "Recipe:") continue;
  const name = text(recipes.getCell(r, 2).value);
  recipeNotes.set(name, text(recipes.getCell(r, 4).value));
  const items: { ingredient: string; qty: number }[] = [];
  for (let i = r + 2; i <= recipes.rowCount; i++) {
    const ing = text(recipes.getCell(i, 1).value);
    if (!ing || ing.startsWith("TOTAL")) break;
    const qty = num(recipes.getCell(i, 2).value);
    if (qty === null) problems.push(`recipe ${name}: no qty for ${ing}`);
    else items.push({ ingredient: ing, qty });
  }
  recipeItems.set(name, items);
}

// Meals: header row 4. Meals with a recipe get ingredient rows; the rest (Cronometer
// custom meals with fixed totals) become one ingredient "1 meal" so totals still work.
const meals = wb.getWorksheet("Meals")!;
let mealCount = 0;
for (let r = 5; r <= meals.rowCount; r++) {
  const row = meals.getRow(r);
  const name = text(row.getCell(1).value);
  if (!name) continue;
  insertMeal.run(name, text(row.getCell(2).value), text(row.getCell(3).value), recipeNotes.get(name) ?? "");
  const id = (mealId.get(name) as { id: number }).id;
  const items = recipeItems.get(name);
  if (items) {
    for (const { ingredient, qty } of items) {
      const ing = ingredientId.get(ingredient) as { id: number } | undefined;
      if (!ing) problems.push(`recipe ${name}: ingredient "${ingredient}" is not in Foods`);
      else insertItem.run(id, ing.id, qty);
    }
  } else {
    const nutrients: Nutrients = {};
    NUTRIENTS.forEach(({ key }, i) => {
      const v = num(row.getCell(4 + i).value);
      if (v !== null) nutrients[key] = v;
    });
    const fixedName = `${name} (fixed totals)`;
    insertIngredient.run(fixedName, "1 meal", text(row.getCell(3).value), null, "Fixed totals imported from the Meals tab; no ingredient breakdown.", looksDairy(name) ? 1 : 0, JSON.stringify(nutrients));
    insertItem.run(id, (ingredientId.get(fixedName) as { id: number }).id, 1);
  }
  mealCount++;
}

// Targets from Day Comparison (header row 14: Rest, Workout, Micro target, Type in cols 8-11).
const dc = wb.getWorksheet("Day Comparison")!;
const insertTarget = db.prepare(
  "INSERT OR REPLACE INTO targets (nutrient, workout, rest, daily, type) VALUES (?, ?, ?, ?, ?)",
);
for (let r = 15; r <= 42; r++) {
  const label = text(dc.getCell(r, 1).value);
  const found = NUTRIENTS.find((n) => `${n.label} (${n.unit})` === label)?.key;
  if (!found) continue;
  // The sheet files the carb targets on its Net Carbs row, but they are meant for total carbs.
  const key = found === "net_carbs" ? "carbs" : found;
  const type = text(dc.getCell(r, 11).value);
  insertTarget.run(key, num(dc.getCell(r, 9).value), num(dc.getCell(r, 8).value), num(dc.getCell(r, 10).value),
    type === "At least" ? "at_least" : type === "No more than" ? "no_more_than" : null);
}

// Days: columns C..E of Day Comparison rows 5-10; header gives the kind (Workout/Rest).
// The three sheet days become three days, each with its own base meals; dinners differ.
const insertDay = db.prepare("INSERT INTO days (name, notes) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET notes=excluded.notes");
const dayId = db.prepare("SELECT id FROM days WHERE name = ?");
const delSlots = db.prepare("DELETE FROM day_slots WHERE day_id = ?");
const insertSlot = db.prepare("INSERT INTO day_slots (day_id, name, position) VALUES (?, ?, ?)");
const insertOption = db.prepare("INSERT OR IGNORE INTO slot_options (slot_id, meal_id, is_planned) VALUES (?, ?, 1)");
for (let col = 3; col <= 5; col++) {
  const header = text(dc.getCell(4, col).value);
  if (!header) continue;
  const dayName = header.split("·")[0].trim();
  insertDay.run(dayName, text(dc.getCell(10 + col - 2, 1).value));
  const id = (dayId.get(dayName) as { id: number }).id;
  delSlots.run(id);
  for (let r = 5; r <= 10; r++) {
    const meal = text(dc.getCell(r, col).value);
    if (!meal) continue;
    const m = mealId.get(meal) as { id: number } | undefined;
    if (!m) { problems.push(`${dayName}: meal "${meal}" not found`); continue; }
    const slot = insertSlot.run(id, text(dc.getCell(r, 1).value), r);
    insertOption.run(Number(slot.lastInsertRowid), m.id);
  }
}

db.exec("COMMIT");
console.log(`imported ${foodCount} foods, ${mealCount} meals, targets, days`);
if (problems.length) console.log("problems:\n" + problems.join("\n"));
