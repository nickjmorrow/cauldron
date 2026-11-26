// Supplements: pills and powders taken on a schedule rather than eaten in a meal. Each says what it is, how much is
// taken and when. The ones being taken add their nutrients to every day, whatever the version, so the day's totals,
// the upper limits and suggested fixes all see them.
import { getDb } from "./db.ts";
import { sum } from "./compute.ts";
import { NUTRIENTS, type NutrientKey, type Nutrients } from "./nutrients.ts";
import type { Ceilings } from "./guardrails.ts";

export const TIMES = [
  { value: "morning", label: "Morning" },
  { value: "afternoon", label: "Afternoon" },
  { value: "evening", label: "Evening" },
  { value: "bedtime", label: "Bedtime" },
] as const;
export const STATUSES = [
  { value: "taking", label: "Taking" },
  { value: "sometimes", label: "Sometimes" },
  { value: "stopped", label: "Stopped" },
] as const;
export type Time = (typeof TIMES)[number]["value"];
export type SupplementStatus = (typeof STATUSES)[number]["value"];

// product: the brand and strength ("Acme, 600 mg capsule"). amount: the dose as taken ("1 capsule").
// note: anything about when or how ("with breakfast"). nutrients: what the dose adds to a day.
export type SupplementInput = { name: string; product: string; amount: string; time: Time; note: string; status: SupplementStatus; nutrients: Nutrients };
export type Supplement = SupplementInput & { id: number };

const MAX_NAME = 120;
const MAX_TEXT = 300;
const TEXT_FIELDS = ["product", "amount", "note"] as const;
const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

// Checks a supplement that came from outside (a form or the API). Returns it cleaned, or what was wrong.
export function parseSupplement(input: unknown): SupplementInput | { error: string } {
  if (!isObject(input)) return { error: "Send a JSON object." };
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return { error: "A supplement needs a name." };
  if (name.length > MAX_NAME) return { error: `name is longer than ${MAX_NAME} characters.` };
  const out: SupplementInput = { name, product: "", amount: "", time: "morning", note: "", status: "taking", nutrients: {} };
  for (const field of TEXT_FIELDS) {
    if (input[field] === undefined) continue;
    if (typeof input[field] !== "string") return { error: `${field} must be text.` };
    if (input[field].trim().length > MAX_TEXT) return { error: `${field} is longer than ${MAX_TEXT} characters.` };
    out[field] = input[field].trim();
  }
  if (input.time !== undefined) {
    const time = TIMES.find((t) => t.value === input.time);
    if (!time) return { error: `time must be one of ${TIMES.map((t) => t.value).join(", ")}.` };
    out.time = time.value;
  }
  if (input.status !== undefined) {
    const status = STATUSES.find((s) => s.value === input.status);
    if (!status) return { error: `status must be one of ${STATUSES.map((s) => s.value).join(", ")}.` };
    out.status = status.value;
  }
  if (input.nutrients !== undefined) {
    if (!isObject(input.nutrients)) return { error: "nutrients must be an object of amounts, like {\"vit_d\": 1000}." };
    for (const [key, value] of Object.entries(input.nutrients)) {
      const nutrient = NUTRIENTS.find((n) => n.key === key);
      if (!nutrient) return { error: `${key} isn't a nutrient. Use one of ${NUTRIENTS.map((n) => n.key).join(", ")}.` };
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return { error: `${nutrient.label} must be a number, 0 or more.` };
      if (value > 0) out.nutrients[nutrient.key] = value;
    }
  }
  return out;
}

type Row = Omit<Supplement, "nutrients"> & { nutrients: string };
const fromRow = (row: Row): Supplement => ({ ...row, nutrients: JSON.parse(row.nutrients) as Nutrients });

// In the order of the day, then by name.
export function listSupplements(): Supplement[] {
  const order = TIMES.map((t, i) => `WHEN '${t.value}' THEN ${i}`).join(" ");
  return (getDb().prepare(`SELECT * FROM supplements ORDER BY CASE time ${order} END, name COLLATE NOCASE`).all() as unknown as Row[]).map(fromRow);
}

export function getSupplement(id: number): Supplement | undefined {
  const row = getDb().prepare("SELECT * FROM supplements WHERE id = ?").get(id) as unknown as Row | undefined;
  return row && fromRow(row);
}

// Adds one, or replaces the one with this id. Throws when another supplement already has the name.
export function saveSupplement(input: SupplementInput, id?: number): Supplement {
  const db = getDb();
  const taken = db.prepare("SELECT id FROM supplements WHERE name = ?").get(input.name) as { id: number } | undefined;
  if (taken && taken.id !== id) throw new Error(`There is already a supplement called "${input.name}".`);
  const values = [input.name, input.product, input.amount, input.time, input.note, input.status, JSON.stringify(input.nutrients)];
  if (id === undefined) {
    id = Number(db.prepare("INSERT INTO supplements (name, product, amount, time, note, status, nutrients) VALUES (?, ?, ?, ?, ?, ?, ?)").run(...values).lastInsertRowid);
  } else {
    db.prepare("UPDATE supplements SET name = ?, product = ?, amount = ?, time = ?, note = ?, status = ?, nutrients = ? WHERE id = ?").run(...values, id);
  }
  return getSupplement(id)!;
}

export function removeSupplement(id: number): void {
  getDb().prepare("DELETE FROM supplements WHERE id = ?").run(id);
}

// What the supplements being taken add to every day.
export function supplementTotals(supplements: Supplement[] = listSupplements()): Nutrients {
  return sum(supplements.filter((s) => s.status === "taking").map((s) => s.nutrients));
}

export type Contribution = { key: NutrientKey; food: number; supplements: number; total: number; ceiling?: number; over: boolean };

// Each nutrient the supplements add to, next to what a day's food already gives and its upper limit, if it has one.
export function contributions(food: Nutrients, supplements: Nutrients, ceilings: Ceilings): Contribution[] {
  return NUTRIENTS.flatMap((n): Contribution[] => {
    const added = supplements[n.key] ?? 0;
    if (added <= 0) return [];
    const total = (food[n.key] ?? 0) + added;
    const ceiling = ceilings[n.key];
    return [{ key: n.key, food: food[n.key] ?? 0, supplements: added, total, ceiling, over: ceiling !== undefined && total > ceiling }];
  });
}
