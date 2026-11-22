// Store sections for shopping items that have no aisle yet, in the order a trip usually walks a grocery store.
// A guess from the item's name; an aisle typed by hand (or remembered from last time) always wins.
export const SECTIONS = [
  "Produce", "Bakery", "Deli", "Meat & seafood", "Dairy & eggs", "Frozen", "Pantry",
  "Condiments & sauces", "Baking & spices", "Snacks", "Drinks", "Household",
] as const;

// First match wins, so the more specific words come first ("rice vinegar" before "rice", "chicken broth" before "chicken").
const RULES: [section: (typeof SECTIONS)[number], words: string[]][] = [
  ["Household", ["cleaner", "sponge", "brush", "detergent", "paper towel", "toilet paper", "trash bag", "dish soap", "foil", "plastic wrap"]],
  ["Frozen", ["frozen", "ice cream"]],
  ["Condiments & sauces", ["vinegar", "soy sauce", "sriracha", "hot sauce", "ketchup", "mustard", "mayo", "syrup", "honey", "oil", "pickled", "salsa", "dressing", "juice"]],
  ["Pantry", ["paste", "broth", "stock", "stuffing", "canned", "beans", "rice", "pasta", "noodle", "oats", "cereal", "lentil", "quinoa"]],
  ["Baking & spices", ["baking", "flour", "sugar", "seeds", "spice", "cinnamon", "salt", "pepper flakes", "peppercorn", "vanilla", "yeast", "cocoa"]],
  ["Dairy & eggs", ["egg", "butter", "milk", "cheese", "yogurt", "cream"]],
  ["Meat & seafood", ["turkey", "chicken", "beef", "pork", "salmon", "shrimp", "fish", "bacon", "sausage", "steak"]],
  ["Deli", ["hummus", "deli", "sliced"]],
  ["Bakery", ["bread", "bagel", "bun", "tortilla", "roll"]],
  ["Snacks", ["chips", "crackers", "nuts", "popcorn", "pretzel"]],
  ["Drinks", ["water", "soda", "coffee", "tea", "seltzer"]],
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
