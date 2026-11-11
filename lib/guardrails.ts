import { NUTRIENTS, type NutrientKey } from "./nutrients.ts";
import type { Target } from "./compute.ts";

// Safety limits that code enforces so no proposal can talk the diet past them, whatever the user allows.
// These are starting points taken from published adult upper limits, not medical advice: check them with a dietitian.
export type Ceilings = Partial<Record<NutrientKey, number>>;

export const PROTEIN_G_PER_KG = 2.2;
const PROTEIN_CEILING_WITHOUT_PROFILE = 200;

// Daily upper limits in the units the app uses (vitamin A in mcg, vitamin D in IU, caffeine in mg).
const FIXED_CEILINGS: Ceilings = {
  vit_a: 3000, vit_c: 2000, vit_d: 4000, vit_e: 1000, calcium: 2500, iron: 45, zinc: 40, choline: 3500, caffeine: 400,
};

export function healthCeilings(weightKg?: number | null): Ceilings {
  return { ...FIXED_CEILINGS, protein: weightKg ? Math.round(weightKg * PROTEIN_G_PER_KG) : PROTEIN_CEILING_WITHOUT_PROFILE };
}

// "No more than" nutrients (sodium, saturated fat, added sugar, cholesterol) are limits already; going over is never okay.
export function canTolerate(target: Target | undefined): boolean {
  return !!target && target.type !== "no_more_than";
}

// Why a tolerance can't be set, or null when it can.
export function checkTolerance(key: NutrientKey, target: Target | undefined, upTo: number | null, ceilings: Ceilings): string | null {
  const label = NUTRIENTS.find((n) => n.key === key)?.label ?? key;
  if (!target) return `${label} has no target, so there is nothing to exceed.`;
  if (!canTolerate(target)) return `${label} has an upper limit, so it can't be marked okay to exceed.`;
  if (upTo !== null && !(upTo > 0)) return `The most you allow must be more than 0.`;
  const ceiling = ceilings[key];
  if (upTo !== null && ceiling !== undefined && upTo > ceiling) return `The most allowed for ${label} is ${ceiling} (its health ceiling).`;
  return null;
}

// How far over target a nutrient may go: undefined when exceeding is not okay, Infinity when only the target matters.
export function okUpTo(tolerance: { okToExceed: boolean; upTo: number | null } | undefined, ceiling: number | undefined): number | undefined {
  if (!tolerance?.okToExceed) return undefined;
  return Math.min(tolerance.upTo ?? Infinity, ceiling ?? Infinity);
}
