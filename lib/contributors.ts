import type { NutrientKey } from "./nutrients.ts";
import { chosenOptions } from "./chosen.ts";
import type { Slot } from "./queries.ts";

export type Contributor = { slot: string; meal: string; amount: number; share: number };

// The meals adding the most of a nutrient to the day for the chosen options, biggest first.
export function topContributors(slots: Slot[], chosen: Record<string, number>, key: NutrientKey, limit: number): { total: number; items: Contributor[] } {
  const all = chosenOptions(slots, chosen)
    .map(({ slot, option }) => ({ slot: slot.name, meal: option.meal.name, amount: option.meal.totals[key] ?? 0 }))
    .filter((c) => c.amount > 0);
  const total = all.reduce((sum, c) => sum + c.amount, 0);
  // Array.prototype.sort is stable, so equal amounts keep their order in the day.
  const items = all.sort((a, b) => b.amount - a.amount).slice(0, limit).map((c) => ({ ...c, share: c.amount / total }));
  return { total, items };
}
