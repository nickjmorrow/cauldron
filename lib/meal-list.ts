// Sorting and filtering for the Meals page, driven by its ?sort=, ?dir= and ?slot= values.
export const MEAL_SORT_KEYS = ["name", "slot", "calories", "protein", "carbs", "fat"] as const;
export type MealSortKey = (typeof MEAL_SORT_KEYS)[number];
export type SortDir = "asc" | "desc";
export type MealSort = { key: MealSortKey; dir: SortDir };

type ListedMeal = { name: string; typical_slot: string; totals: Record<string, number | undefined> };

const isText = (key: MealSortKey) => key === "name" || key === "slot";
// Text reads A to Z first; for a nutrient the biggest is what you're usually looking for.
export const firstDir = (key: MealSortKey): SortDir => (isText(key) ? "asc" : "desc");

// By name, A to Z, when the values are missing or unknown.
export function parseMealSort(sort: string | undefined, dir: string | undefined): MealSort {
  const key = MEAL_SORT_KEYS.find((k) => k === sort) ?? "name";
  return { key, dir: dir === "asc" || dir === "desc" ? dir : firstDir(key) };
}

// What a click on a column heading sorts by: that column, flipped when it's already the sorted one.
export function nextMealSort(current: MealSort, key: MealSortKey): MealSort {
  if (current.key !== key) return { key, dir: firstDir(key) };
  return { key, dir: current.dir === "asc" ? "desc" : "asc" };
}

export function sortMeals<T extends ListedMeal>(meals: T[], sort: MealSort): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  const compare = (a: T, b: T) => {
    if (sort.key === "name") return byName(a, b);
    if (sort.key === "slot") return compareSlots(a.typical_slot, b.typical_slot);
    return (a.totals[sort.key] ?? 0) - (b.totals[sort.key] ?? 0);
  };
  const sign = sort.dir === "asc" ? 1 : -1;
  return [...meals].sort((a, b) => sign * compare(a, b) || byName(a, b));
}

// Meal times in the order of a day; any other value (Snack, Baking) comes after them, A to Z; no value comes last.
const DAY_ORDER = ["breakfast", "lunch", "dinner"];
export function compareSlots(a: string, b: string): number {
  const rank = (s: string) => { const i = DAY_ORDER.indexOf(s.toLowerCase()); return s === "" ? DAY_ORDER.length + 1 : i === -1 ? DAY_ORDER.length : i; };
  return rank(a) - rank(b) || a.localeCompare(b);
}

// The "Usually" values among these meals, in day order, for the filter chips.
export function mealSlots(meals: { typical_slot: string }[]): string[] {
  return [...new Set(meals.map((m) => m.typical_slot).filter(Boolean))].sort(compareSlots);
}

// The day's swaps: the meals of each part of a slot that has two or more to pick from, in the day's order.
export function swapGroups(slots: { parts: { options: { meal: { id: number } }[] }[] }[]): number[][] {
  return slots.flatMap((s) => s.parts.map((p) => p.options.map((o) => o.meal.id))).filter((ids) => ids.length > 1);
}

// Listed meals with each swap group kept together (groups in the day's order), then one last group of everything else.
// Rows keep the order they came in. A swap group with a single meal left to show isn't a group; a meal in two goes with the first.
export function groupBySwaps<T extends { id: number }>(meals: T[], swaps: number[][]): T[][] {
  const placed = new Set<number>();
  const groups: T[][] = [];
  for (const ids of swaps) {
    const group = meals.filter((m) => ids.includes(m.id) && !placed.has(m.id));
    if (group.length < 2) continue;
    for (const m of group) placed.add(m.id);
    groups.push(group);
  }
  const rest = meals.filter((m) => !placed.has(m.id));
  return rest.length ? [...groups, rest] : groups;
}
