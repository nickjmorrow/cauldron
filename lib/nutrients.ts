export type NutrientKey = (typeof NUTRIENTS)[number]["key"];

// Order and units match the Foods tab of the import spreadsheet (scripts/import-xlsx.ts).
export const NUTRIENTS = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "protein", label: "Protein", unit: "g" },
  { key: "carbs", label: "Total Carbs", unit: "g" },
  { key: "fiber", label: "Fiber", unit: "g" },
  { key: "net_carbs", label: "Net Carbs", unit: "g" },
  { key: "sugars", label: "Total Sugars", unit: "g" },
  { key: "added_sugars", label: "Added Sugars", unit: "g" },
  { key: "fat", label: "Total Fat", unit: "g" },
  { key: "sat_fat", label: "Saturated Fat", unit: "g" },
  { key: "trans_fat", label: "Trans Fat", unit: "g" },
  { key: "omega3", label: "Omega-3", unit: "g" },
  { key: "omega6", label: "Omega-6", unit: "g" },
  { key: "cholesterol", label: "Cholesterol", unit: "mg" },
  { key: "sodium", label: "Sodium", unit: "mg" },
  { key: "potassium", label: "Potassium", unit: "mg" },
  { key: "calcium", label: "Calcium", unit: "mg" },
  { key: "iron", label: "Iron", unit: "mg" },
  { key: "magnesium", label: "Magnesium", unit: "mg" },
  { key: "zinc", label: "Zinc", unit: "mg" },
  { key: "vit_a", label: "Vitamin A", unit: "mcg" },
  { key: "vit_c", label: "Vitamin C", unit: "mg" },
  { key: "vit_d", label: "Vitamin D", unit: "IU" },
  { key: "vit_e", label: "Vitamin E", unit: "mg" },
  { key: "vit_k", label: "Vitamin K", unit: "mcg" },
  { key: "b12", label: "Vitamin B12", unit: "mcg" },
  { key: "folate", label: "Folate", unit: "mcg" },
  { key: "choline", label: "Choline", unit: "mg" },
  { key: "caffeine", label: "Caffeine", unit: "mg" },
] as const;

export type Nutrients = Partial<Record<NutrientKey, number>>;

const GROUP_KEYS: [string, NutrientKey[]][] = [
  ["Energy and macros", ["calories", "protein", "carbs", "fiber", "net_carbs", "sugars", "added_sugars"]],
  ["Fats", ["fat", "sat_fat", "trans_fat", "omega3", "omega6", "cholesterol"]],
  ["Minerals", ["sodium", "potassium", "calcium", "iron", "magnesium", "zinc"]],
  ["Vitamins and other", ["vit_a", "vit_c", "vit_d", "vit_e", "vit_k", "b12", "folate", "choline", "caffeine"]],
];

export const NUTRIENT_GROUPS = GROUP_KEYS.map(([name, keys]) => ({
  name,
  items: keys.map((k) => NUTRIENTS.find((n) => n.key === k)!),
}));
