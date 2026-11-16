// Ingredient categories in the order the Ingredients page lists them.
export const CATEGORIES = [
  "Fruit", "Vegetables", "Frozen vegetables", "Frozen fruit", "Meat & poultry", "Seafood", "Eggs", "Dairy",
  "Beans & legumes", "Grains & bread", "Dips & spreads", "Sauces & condiments", "Pickles & ferments",
  "Oils & vinegars", "Juices", "Milks", "Shakes & bars", "Prepared meals",
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

// Kitchen staples kept on hand outside the meal plan.
export const STAPLE_KINDS = { spice: "Spices", baking: "Baking" } as const;
export type StapleKind = keyof typeof STAPLE_KINDS;
export const isStapleKind = (kind: string): kind is StapleKind => Object.hasOwn(STAPLE_KINDS, kind);
