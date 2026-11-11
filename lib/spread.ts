import { chosenOptions, partKey } from "./chosen.ts";
import { dayTotals } from "./compute.ts";
import type { NutrientKey } from "./nutrients.ts";
import type { Slot } from "./queries.ts";

export const BINS = 10;
export const MAX_COMBOS = 5000;

// A part of a slot that has variations; its meals are interchangeable.
export type PartInfo = { slotName: string; key: string; label: string; options: { id: number; name: string }[] };
export type Driver = { part: PartInfo; share: number };
export type NutrientSpread = {
  min: number;
  max: number;
  mean: number;
  bins: number[]; // how many combinations land in each tenth between min and max
  values: number[]; // one per combination
  low: string[]; // the meals in the lowest possible day, one per varying part
  high: string[];
  driver?: Driver; // the part whose choice moves this nutrient most, and its share of all the part effects
  byChoice: { part: PartInfo; means: { name: string; mean: number }[] }[];
};
export type DaySpread = { combos: number; sampled: boolean; parts: PartInfo[]; nutrients: Record<NutrientKey, NutrientSpread> };

// The start of each meal's name is enough to tell a part's meals apart ("Lemon-Pepper / Chili-Lime").
const label = (names: string[]) => `${names.slice(0, 3).map((n) => n.split(/[\s,]/)[0]).join(" / ")}${names.length > 3 ? " …" : ""}`;

// Seeded so the same day always draws the same sample.
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Which option each part takes in each combination: all of them when there are few, otherwise a sample in which
// every option of every part appears equally often, so averages of anything additive stay exact.
function choices(sizes: number[], max: number): { digits: number[][]; combos: number; sampled: boolean } {
  const total = sizes.reduce((a, n) => a * n, 1);
  if (total <= max) {
    const digits = Array.from({ length: total }, (_, i) => {
      let rest = i;
      return sizes.map((n) => { const d = rest % n; rest = Math.floor(rest / n); return d; });
    });
    return { digits, combos: total, sampled: false };
  }
  const rand = random(sizes.length * 7919 + total % 104729);
  const columns = sizes.map((n) => {
    const column = Array.from({ length: max }, (_, i) => i % n);
    for (let i = max - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [column[i], column[j]] = [column[j], column[i]]; }
    return column;
  });
  return { digits: Array.from({ length: max }, (_, i) => columns.map((c) => c[i])), combos: max, sampled: true };
}

// How much each nutrient can vary across the day's variations, counting every combination of meals equally.
export function daySpread(slots: Slot[], keys: NutrientKey[], max = MAX_COMBOS): DaySpread {
  const parts = slots.flatMap((slot) => slot.parts.filter((p) => p.options.length > 1).map((p): PartInfo => ({
    slotName: slot.name,
    key: partKey(slot.id, p.part),
    label: label(p.options.map((o) => o.meal.name)),
    options: p.options.map((o) => ({ id: o.optionId, name: o.meal.name })),
  })));
  const { digits, combos, sampled } = choices(parts.map((p) => p.options.length), max);
  const totals = digits.map((d) => dayTotals(chosenOptions(slots, Object.fromEntries(parts.map((p, j) => [p.key, p.options[d[j]].id]))).map(({ option }) => option.meal.totals)));

  const nutrients = {} as Record<NutrientKey, NutrientSpread>;
  for (const key of keys) {
    const values = totals.map((t) => t[key] ?? 0);
    const min = Math.min(...values), max = Math.max(...values);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const bins = Array<number>(BINS).fill(0);
    for (const v of values) bins[max === min ? 0 : Math.min(BINS - 1, Math.floor(((v - min) / (max - min)) * BINS))]++;
    const names = (at: number) => parts.map((p, j) => p.options[digits[at][j]].name);
    const byChoice = parts.map((part, j) => ({
      part,
      means: part.options.map((o, k) => {
        const mine = values.filter((_, i) => digits[i][j] === k);
        return { name: o.name, mean: mine.reduce((a, b) => a + b, 0) / (mine.length || 1) };
      }),
    }));
    const spreads = byChoice.map((c) => Math.max(...c.means.map((m) => m.mean)) - Math.min(...c.means.map((m) => m.mean)));
    const all = spreads.reduce((a, b) => a + b, 0);
    const top = spreads.indexOf(Math.max(...spreads));
    nutrients[key] = {
      min, max, mean, bins, values, byChoice,
      low: names(values.indexOf(min)), high: names(values.indexOf(max)),
      driver: all > 0 ? { part: parts[top], share: spreads[top] / all } : undefined,
    };
  }
  return { combos, sampled, parts, nutrients };
}
