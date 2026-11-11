import { NUTRIENTS, type Nutrients } from "./nutrients.ts";

export type Target = {
  workout: number | null;
  rest: number | null;
  daily: number | null;
  type: "at_least" | "no_more_than" | null;
};

export function scale(nutrients: Nutrients, qty: number): Nutrients {
  const out: Nutrients = {};
  for (const { key } of NUTRIENTS) {
    if (nutrients[key] !== undefined) out[key] = nutrients[key]! * qty;
  }
  return out;
}

export function add(a: Nutrients, b: Nutrients): Nutrients {
  const out: Nutrients = { ...a };
  for (const { key } of NUTRIENTS) {
    if (b[key] !== undefined) out[key] = (out[key] ?? 0) + b[key]!;
  }
  return out;
}

export function sum(list: Nutrients[]): Nutrients {
  return list.reduce(add, {});
}

export type MealItem = { nutrients: Nutrients; qty: number };

export function mealTotals(items: MealItem[]): Nutrients {
  return sum(items.map((i) => scale(i.nutrients, i.qty)));
}

// A day has slots; each slot holds meal options and one of them is planned.
// Nutrients for a given choice of one option per slot.
export function dayTotals(chosen: Nutrients[]): Nutrients {
  return sum(chosen);
}

export type Verdict = "good" | "close" | "bad" | "none";

// Share of target reached, and whether that is on target. "close" is within 10%.
export function judge(value: number, target: number, type: Target["type"]): { pct: number; verdict: Verdict } {
  if (!target) return { pct: 0, verdict: "none" };
  const pct = value / target;
  // No direction (calories, protein, fat): aim for the target itself, within 5% is good.
  if (!type) {
    const off = Math.abs(pct - 1);
    return { pct, verdict: off <= 0.05 ? "good" : off <= 0.1 ? "close" : "bad" };
  }
  if (type === "no_more_than") {
    return { pct, verdict: pct <= 1 ? "good" : pct <= 1.1 ? "close" : "bad" };
  }
  return { pct, verdict: pct >= 1 ? "good" : pct >= 0.9 ? "close" : "bad" };
}

const DAIRY_WORDS = /\b(milk|cheese|butter|cream|yogurt|yoghurt|whey|casein|ghee|kefir|custard|ice cream)\b/i;
const NON_DAIRY_MILKS = /\b(oat|almond|soy|coconut|rice|cashew|pea|hemp)\s?(milk|milks|butter|cream|yogurt)\b|oatmilk|peanut butter|nut butter|cocoa butter|shea butter|apple butter/i;

// Name-based guess; a person can override it on the ingredient.
export function looksDairy(name: string, category = ""): boolean {
  if (/^dairy and egg/i.test(category) && !/\begg\b/i.test(name)) return true;
  if (NON_DAIRY_MILKS.test(name)) return false;
  return DAIRY_WORDS.test(name);
}
