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

// The listed meals laid out the way the day is built: a section per slot of the day, holding its parts (the things
// eaten together), each part holding its swaps. Meals in no slot make one last section with no slot name.
// Rows keep the order they came in; a part or slot with nothing to show is left out; a meal in two parts goes with the first.
export type MealSection<T> = { slot: string | null; parts: T[][] };
type DaySlot = { name: string; parts: { options: { meal: { id: number } }[] }[] };
export function mealsBySlot<T extends { id: number }>(meals: T[], slots: DaySlot[]): MealSection<T>[] {
  const placed = new Set<number>();
  const sections: MealSection<T>[] = [];
  for (const slot of slots) {
    const parts: T[][] = [];
    for (const part of slot.parts) {
      const ids = new Set(part.options.map((o) => o.meal.id));
      const shown = meals.filter((m) => ids.has(m.id) && !placed.has(m.id));
      for (const m of shown) placed.add(m.id);
      if (shown.length > 0) parts.push(shown);
    }
    if (parts.length > 0) sections.push({ slot: slot.name, parts });
  }
  const rest = meals.filter((m) => !placed.has(m.id));
  return rest.length > 0 ? [...sections, { slot: null, parts: [rest] }] : sections;
}

// How a slot is put together, for its heading: "one of 3" for a single part with swaps, "4 parts eaten together" for several.
export function describeParts(parts: unknown[][]): string {
  if (parts.length > 1) return `${parts.length} parts eaten together`;
  return parts[0].length > 1 ? `one of ${parts[0].length}` : "";
}
