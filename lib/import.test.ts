import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, rmSync } from "node:fs";
import ExcelJS from "exceljs";
import { spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";

// Imports a small made-up spreadsheet into its own database file, so the real one is never touched.
const FILE = "data/test-import.db";
const XLSX = "data/test-import.xlsx";
process.env.CAULDRON_DB = FILE;
process.env.CAULDRON_XLSX = XLSX;
for (const ext of ["", "-wal", "-shm"]) rmSync(FILE + ext, { force: true });

// Same layout the importer reads: Foods and Meals from row 5 (nutrients from column 4 in NUTRIENTS order),
// "Recipe:" blocks, and Day Comparison with day headers in row 4 columns C..E and meals in rows 5-10.
const wb = new ExcelJS.Workbook();
const foods = wb.addWorksheet("Foods");
[["Oats", "40 g", 150, 5], ["Banana", "1 medium", 105, 1.3], ["Peanut butter", "2 tbsp", 190, 7],
  ["Chicken breast", "100 g", 165, 31], ["Rice", "1 cup", 205, 4.3], ["Broccoli", "1 cup", 31, 2.6]]
  .forEach(([name, serving, kcal, protein], i) => foods.getRow(5 + i).values = [name, serving, "Label", kcal, protein]);
const recipes = wb.addWorksheet("Recipes");
const recipe = (row: number, name: string, items: [string, number][]) => {
  recipes.getRow(row).values = ["Recipe:", name];
  recipes.getRow(row + 1).values = ["Ingredient", "Qty"];
  items.forEach(([ing, qty], i) => recipes.getRow(row + 2 + i).values = [ing, qty]);
  recipes.getRow(row + 2 + items.length).values = ["TOTAL"];
};
recipe(1, "Oat bowl", [["Oats", 2], ["Banana", 1], ["Peanut butter", 1]]);
recipe(10, "Chicken rice bowl", [["Chicken breast", 1.5], ["Rice", 1], ["Broccoli", 1]]);
const meals = wb.addWorksheet("Meals");
meals.getRow(5).values = ["Oat bowl", "Breakfast", "Recipe"];
meals.getRow(6).values = ["Chicken rice bowl", "Dinner", "Recipe"];
meals.getRow(7).values = ["Lentil soup", "Dinner", "Label", 320, 18]; // no recipe: fixed totals
const dc = wb.addWorksheet("Day Comparison");
dc.getRow(4).values = [null, null, "Day 1 · Workout", "Day 2 · Rest", "Day 3 · Rest"];
dc.getRow(5).values = ["Breakfast", null, "Oat bowl", "Oat bowl", "Oat bowl"];
dc.getRow(6).values = ["Dinner", null, "Chicken rice bowl", "Chicken rice bowl", "Lentil soup"];
dc.getRow(15).values = ["Protein (g)", null, null, null, null, null, null, 120, 140, null, ""];
mkdirSync("data", { recursive: true });
await wb.xlsx.writeFile(XLSX);
const run = spawnSync("node", ["scripts/import-xlsx.ts"], { env: process.env, encoding: "utf8" });
const { listDays, totalsForChoice } = await import("./queries.ts");

test.after(() => { for (const ext of ["", "-wal", "-shm"]) rmSync(FILE + ext, { force: true }); rmSync(XLSX, { force: true }); });

// Expected numbers worked out by hand from the fixture above.
const approx = (a: number | undefined, b: number) => assert.ok(Math.abs((a ?? NaN) - b) < 0.01, `${a} vs ${b}`);

test("imported days reproduce the spreadsheet's totals", () => {
  assert.equal(run.status, 0, run.stderr);
  const days = Object.fromEntries(listDays().map((d) => [d.name, d]));
  const d1 = totalsForChoice(days["Day 1"]);
  approx(d1.calories, 1078.5); // oat bowl 2*150 + 105 + 190, chicken rice bowl 1.5*165 + 205 + 31
  approx(d1.protein, 71.7); // 2*5 + 1.3 + 7, 1.5*31 + 4.3 + 2.6
  approx(totalsForChoice(days["Day 3"]).calories, 915); // oat bowl 595 + lentil soup 320
});

test("importing refuses to run over a database whose versions have adjustments, and leaves them alone", () => {
  const guarded = "data/test-import-guard.db";
  const wipe = () => ["", "-wal", "-shm"].forEach((e) => rmSync(guarded + e, { force: true }));
  wipe();
  const env = { ...process.env, CAULDRON_DB: guarded };
  const dbUrl = new URL("./db.ts", import.meta.url).href;
  const seed = spawnSync(process.execPath, ["--input-type=module", "-e",
    `const { getDb } = await import(${JSON.stringify(dbUrl)}); getDb().exec("INSERT INTO days (id, name) VALUES (1,'D'); INSERT INTO day_versions (id, day_id, kind, goal, status) VALUES (1,1,'rest','cut','approved'); INSERT INTO day_slots (id, day_id, name, position) VALUES (1,1,'B',1); INSERT INTO meals (id, name) VALUES (1,'M'); INSERT INTO slot_options (id, slot_id, meal_id) VALUES (1,1,1); INSERT INTO version_adjustments (version_id, kind, option_id) VALUES (1,'remove',1)");`], { env, encoding: "utf8" });
  assert.equal(seed.status, 0, seed.stderr);
  const attempt = spawnSync("node", ["scripts/import-xlsx.ts"], { env, encoding: "utf8" });
  assert.notEqual(attempt.status, 0);
  assert.match(attempt.stderr, /adjustments/);
  const db = new DatabaseSync(guarded);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM version_adjustments").get() as { n: number }).n, 1);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM day_slots").get() as { n: number }).n, 1);
  db.close();
  wipe();
});
