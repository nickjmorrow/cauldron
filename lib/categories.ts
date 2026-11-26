import { compareAisles } from "./sections.ts";

// Ingredient categories in the order the Ingredients page lists them.
export const CATEGORIES = [
  "Fruit", "Vegetables", "Frozen vegetables", "Frozen fruit", "Meat & poultry", "Seafood", "Eggs", "Dairy",
  "Beans & legumes", "Grains & bread", "Dips & spreads", "Sauces & condiments", "Pickles & ferments",
  "Oils & vinegars", "Spices & seasonings", "Sugars & sweeteners", "Baking", "Juices", "Milks", "Shakes & bars",
  "Prepared meals",
] as const;
export const UNCATEGORIZED = "Uncategorized";

// Groups items by category in CATEGORIES order, empty groups left out; anything without a known category comes last.
export function groupByCategory<T extends { category: string }>(items: T[]): { category: string; items: T[] }[] {
  const known = new Set<string>(CATEGORIES);
  return [...CATEGORIES, UNCATEGORIZED]
    .map((category) => ({
      category,
      items: items.filter((i) => (known.has(i.category) ? i.category : UNCATEGORIZED) === category),
    }))
    .filter((g) => g.items.length > 0);
}

// For things cooked from other ingredients (a sauce, a loaf): they have no place in the store.
export const HOMEMADE = "Made at home";

// Where a category is found when the ingredient hasn't been given a place of its own. Only the departments around the
// store's edge can be told from the category; a middle-of-store ingredient has no area until its aisle is set.
const CATEGORY_AREA: Record<string, string> = {
  Fruit: "Produce", Vegetables: "Produce", "Frozen vegetables": "Frozen", "Frozen fruit": "Frozen",
  "Meat & poultry": "Meat & seafood", Seafood: "Meat & seafood", Eggs: "Dairy & eggs", Dairy: "Dairy & eggs", Milks: "Dairy & eggs",
};

// The area of the store an ingredient is in: an aisle number ("4"), a named area ("Produce"), or "" when not known.
export function areaOf(item: { aisle: string; category: string }): string {
  return item.aisle || CATEGORY_AREA[item.category] || "";
}

// Groups items by area of the store in walking order (numbered aisles, the store's sections, other named areas, then
// the ones with no area), and by category inside each area.
export function groupByArea<T extends { aisle: string; category: string }>(items: T[]): { area: string; count: number; groups: { category: string; items: T[] }[] }[] {
  return [...new Set(items.map(areaOf))].sort(compareAisles).map((area) => {
    const here = items.filter((i) => areaOf(i) === area);
    return { area, count: here.length, groups: groupByCategory(here) };
  });
}
