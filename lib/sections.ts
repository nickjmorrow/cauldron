// Named store areas for shopping items with no aisle number yet, in the order a trip usually walks the store.
// Only the departments around the edge of a grocery store are real named areas; everything in the middle of the
// store is in a numbered aisle, so a middle-of-store item has no area until its aisle number is known (typed by
// hand, remembered from last time, or looked up: lib/aisles.ts).
export const SECTIONS = ["Produce", "Bakery", "Deli", "Meat & seafood", "Dairy & eggs", "Frozen"] as const;

// Names used before only real areas were kept. An item still filed under one of these has no real aisle.
export const RETIRED_SECTIONS = ["Pantry", "Condiments & sauces", "Baking & spices", "Snacks", "Drinks", "Household"];

const MIDDLE = ""; // a middle-of-store item: numbered aisle, not known from the name alone

// First match wins, so the more specific words come first ("tomato paste" is a middle-of-store item, not produce;
// "chicken broth" is not meat).
const RULES: [area: string, words: string[]][] = [
  [MIDDLE, ["cleaner", "sponge", "brush", "detergent", "paper towel", "toilet paper", "trash bag", "dish soap", "foil", "plastic wrap",
    "vinegar", "soy sauce", "sriracha", "hot sauce", "ketchup", "mustard", "mayo", "syrup", "honey", "oil", "pickled", "salsa",
    "dressing", "juice", "paste", "broth", "stock", "stuffing", "canned", "beans", "rice", "pasta", "noodle", "oats", "cereal",
    "lentil", "quinoa", "baking", "flour", "sugar", "seeds", "spice", "cinnamon", "salt", "pepper flakes", "peppercorn", "vanilla",
    "yeast", "cocoa", "chips", "crackers", "nuts", "popcorn", "pretzel", "water", "soda", "coffee", "tea", "seltzer"]],
  ["Frozen", ["frozen", "ice cream"]],
  ["Dairy & eggs", ["egg", "butter", "milk", "cheese", "yogurt", "cream"]],
  ["Meat & seafood", ["turkey", "chicken", "beef", "pork", "salmon", "shrimp", "fish", "bacon", "sausage", "steak"]],
  ["Deli", ["hummus", "deli", "sliced"]],
  ["Bakery", ["bread", "bagel", "bun", "tortilla", "roll"]],
  ["Produce", ["celery", "parsley", "sage", "thyme", "rosemary", "basil", "mint", "cilantro", "garlic", "onion", "scallion", "shallot",
    "avocado", "apple", "clementine", "orange", "lemon", "lime", "banana", "berries", "grape", "cucumber", "tomato", "potato", "carrot",
    "lettuce", "spinach", "kale", "pepper", "jalapeño", "ginger", "mushroom", "broccoli", "zucchini", "squash"]],
];

// Words match at the start of a word, so "salt" doesn't catch "unsalted butter".
export function guessSection(name: string): string {
  const words = name.toLowerCase().split(/[^\p{L}]+/u);
  const text = ` ${words.join(" ")}`;
  return RULES.find(([, keys]) => keys.some((k) => text.includes(` ${k}`)))?.[0] ?? "";
}

// Where a named area sorts among the sections; names that aren't sections come after them.
export function sectionRank(area: string): number {
  const i = SECTIONS.findIndex((s) => s.toLowerCase() === area.toLowerCase());
  return i === -1 ? SECTIONS.length : i;
}
