// Which meals a shopping item is for, when it's added without a reason: the meals that use an ingredient of the same
// name. Only meals in the typical day count, not ones cooked occasionally or left over from iterating.
import { getDb } from "./db.ts";
import { getOnlyDay, inUse } from "./queries.ts";

const MAX_FILLED = 3;

// "Celery, Raw" and "celery" are the same thing to buy, and so are "Eggs" and "Egg": the text before the first
// comma or bracket, lower-cased, without a plural "s".
export function buyName(name: string): string {
  return name.split(/[,(]/)[0].trim().toLowerCase().replace(/s$/, "");
}

export function mealsUsing(itemName: string): string[] {
  const wanted = buyName(itemName);
  if (!wanted) return [];
  const rows = getDb().prepare(`SELECT m.id, m.name, i.name AS ingredient FROM meal_items mi
    JOIN meals m ON m.id = mi.meal_id JOIN ingredients i ON i.id = mi.ingredient_id
    WHERE m.status = 'approved' ORDER BY m.name COLLATE NOCASE`).all() as { id: number; name: string; ingredient: string }[];
  const using = rows.filter((r) => buyName(r.ingredient) === wanted);
  if (using.length === 0) return [];
  const typical = inUse(getOnlyDay()).meals;
  return [...new Set(using.filter((r) => typical.has(r.id)).map((r) => r.name))].slice(0, MAX_FILLED);
}
