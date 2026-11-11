import { scale } from "./compute.ts";
import type { Ingredient, MealWithTotals, Slot, SlotOption } from "./queries.ts";

// How a version differs from the base day: drop a meal, scale a meal's portion, pick the planned variation, or add a food to a slot.
export type Adjustment =
  | { id: number; kind: "remove"; optionId: number }
  | { id: number; kind: "scale"; optionId: number; factor: number }
  | { id: number; kind: "plan"; optionId: number } // this meal is the planned one among its part's variations
  | { id: number; kind: "add"; slotId: number; mealId: number | null; ingredientId: number | null; qty: number };

// What a resolved option remembers about the adjustment that made it, so the page can offer to undo it.
export type OptionAdjust =
  | { kind: "scale"; adjustmentId: number; factor: number }
  | { kind: "add"; adjustmentId: number; qty: number; ingredientId: number | null; mealId: number | null };

export type Lookup = { meal: (id: number) => MealWithTotals | undefined; ingredient: (id: number) => Ingredient | undefined };

// Added foods sit after every base part; their part numbers start here so they never collide.
const ADDED_PART_BASE = 1000;

// The day a version actually eats: base meals minus removed ones, scaled portions, plus added foods.
// Adjustments aimed at things that no longer exist are ignored. The base slots are never modified.
export function resolveVersion(base: Slot[], adjustments: Adjustment[], lookup: Lookup): Slot[] {
  const removed = new Set(adjustments.flatMap((a) => (a.kind === "remove" ? [a.optionId] : [])));
  const scaled = new Map(adjustments.flatMap((a) => (a.kind === "scale" ? [[a.optionId, a] as const] : [])));
  const planned = new Set(adjustments.flatMap((a) => (a.kind === "plan" ? [a.optionId] : [])));
  const adds = adjustments.flatMap((a) => (a.kind === "add" ? [a] : []));

  return base.map((slot) => {
    const parts = slot.parts
      .map((p) => ({ part: p.part, options: p.options.filter((o) => !removed.has(o.optionId)).map((o) => scaleOption(o, scaled.get(o.optionId)?.factor, scaled.get(o.optionId)?.id)) }))
      .filter((p) => p.options.length > 0)
      .map((p) => {
        const choice = p.options.find((o) => planned.has(o.optionId));
        return choice ? { ...p, options: p.options.map((o) => (o.isPlanned === (o === choice) ? o : { ...o, isPlanned: o === choice })) } : p;
      });
    for (const add of adds.filter((a) => a.slotId === slot.id)) {
      const food = addedFood(add, lookup);
      if (food) parts.push({ part: ADDED_PART_BASE + add.id, options: [{ optionId: -add.id, meal: food, isPlanned: true, adjust: { kind: "add", adjustmentId: add.id, qty: add.qty, ingredientId: add.ingredientId, mealId: add.mealId } }] });
    }
    return { ...slot, parts };
  });
}

function scaleOption(option: SlotOption, factor: number | undefined, adjustmentId: number | undefined): SlotOption {
  if (factor === undefined || adjustmentId === undefined) return option;
  return { ...option, meal: { ...option.meal, totals: scale(option.meal.totals, factor) }, adjust: { kind: "scale", adjustmentId, factor } };
}

// An added ingredient is shown as a one-item meal so everything downstream treats it like any other meal.
function addedFood(add: Extract<Adjustment, { kind: "add" }>, lookup: Lookup): MealWithTotals | undefined {
  if (add.mealId !== null) {
    const meal = lookup.meal(add.mealId);
    return meal && { ...meal, totals: scale(meal.totals, add.qty) };
  }
  const ingredient = add.ingredientId === null ? undefined : lookup.ingredient(add.ingredientId);
  if (!ingredient) return undefined;
  return {
    id: -ingredient.id, name: ingredient.name, typical_slot: "", source: "", notes: "", status: "approved",
    totals: scale(ingredient.nutrients, add.qty), items: [{ ingredient, qty: add.qty }],
  };
}
