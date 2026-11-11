import { getDb } from "./db.ts";
import { looksDairy } from "./compute.ts";
import type { Nutrients, NutrientKey } from "./nutrients.ts";

const API = "https://api.nal.usda.gov/fdc/v1";
const DATA_TYPES = "SR Legacy,Foundation";

// FDC nutrient numbers; several numbers are summed (omega fats come as individual fatty acids).
const NUMBERS: Record<Exclude<NutrientKey, "net_carbs">, string[]> = {
  calories: ["208", "957", "958"], protein: ["203"], carbs: ["205"], fiber: ["291"],
  sugars: ["269", "269.3"], added_sugars: ["539"], fat: ["204"], sat_fat: ["606"], trans_fat: ["605"],
  omega3: ["619", "629", "621", "631"], omega6: ["618", "620"], cholesterol: ["601"], sodium: ["307"],
  potassium: ["306"], calcium: ["301"], iron: ["303"], magnesium: ["304"], zinc: ["309"],
  vit_a: ["320"], vit_c: ["401"], vit_d: ["324"], vit_e: ["323"], vit_k: ["430"], b12: ["418"],
  folate: ["417"], choline: ["421"], caffeine: ["262"],
};
// Energy has fallbacks, not parts: take the first number present.
const FIRST_OF = new Set<string>(["calories", "sugars"]);

type FdcNutrient = { nutrientNumber?: string; value?: number };
export type FdcFood = { fdcId: number; description: string; dataType?: string; foodCategory?: string; foodNutrients?: FdcNutrient[] };

// FDC reports per 100 g. Nutrients FDC doesn't report stay missing rather than guessed as zero.
export function mapNutrients(food: FdcFood): Nutrients {
  const byNumber = new Map<string, number>();
  for (const n of food.foodNutrients ?? []) {
    if (n.nutrientNumber && typeof n.value === "number") byNumber.set(n.nutrientNumber, n.value);
  }
  const out: Nutrients = {};
  for (const [key, numbers] of Object.entries(NUMBERS)) {
    const found = numbers.filter((n) => byNumber.has(n));
    if (!found.length) continue;
    const values = FIRST_OF.has(key) ? [byNumber.get(found[0])!] : found.map((n) => byNumber.get(n)!);
    out[key as NutrientKey] = values.reduce((a, b) => a + b, 0);
  }
  if (out.carbs !== undefined) out.net_carbs = out.carbs - (out.fiber ?? 0);
  return out;
}

export type Candidate = {
  fdcId: number; name: string; category: string; contains_dairy: boolean; nutrients: Nutrients;
};

export async function searchUsda(query: string, limit = 5): Promise<Candidate[]> {
  const key = process.env.USDA_API_KEY ?? "DEMO_KEY";
  const cacheKey = `search:${query.toLowerCase()}:${limit}`;
  const db = getDb();
  const cached = db.prepare("SELECT body FROM usda_cache WHERE key = ?").get(cacheKey) as { body: string } | undefined;
  let foods: FdcFood[];
  if (cached) {
    foods = JSON.parse(cached.body);
  } else {
    const url = `${API}/foods/search?api_key=${key}&query=${encodeURIComponent(query)}&dataType=${encodeURIComponent(DATA_TYPES)}&pageSize=${limit}`;
    const res = await fetch(url);
    if (res.status === 429) throw new Error("USDA rate limit reached (DEMO_KEY allows ~10 requests an hour). Set USDA_API_KEY in .env.local.");
    if (!res.ok) throw new Error(`USDA search failed: ${res.status}`);
    foods = ((await res.json()) as { foods: FdcFood[] }).foods;
    db.prepare("INSERT OR REPLACE INTO usda_cache (key, body) VALUES (?, ?)").run(cacheKey, JSON.stringify(foods));
  }
  return foods.map((f) => ({
    fdcId: f.fdcId,
    name: f.description,
    category: f.foodCategory ?? "",
    contains_dairy: looksDairy(f.description, f.foodCategory),
    nutrients: mapNutrients(f),
  }));
}
