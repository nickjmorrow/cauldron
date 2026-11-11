import { getDb } from "./db.ts";
import type { NutrientKey } from "./nutrients.ts";
import { checkTolerance, healthCeilings } from "./guardrails.ts";
import { getProfile, listTargets } from "./queries.ts";

export type Tolerance = { okToExceed: boolean; upTo: number | null };

export function listTolerances(): Record<string, Tolerance> {
  const rows = getDb().prepare("SELECT nutrient, ok_to_exceed, up_to FROM tolerances WHERE ok_to_exceed = 1").all() as { nutrient: string; ok_to_exceed: number; up_to: number | null }[];
  return Object.fromEntries(rows.map((r) => [r.nutrient, { okToExceed: true, upTo: r.up_to }]));
}

// Returns why it can't be set, or null when saved. Turning a tolerance off removes it.
export function setTolerance(key: NutrientKey, okToExceed: boolean, upTo: number | null): string | null {
  const db = getDb();
  if (!okToExceed) {
    db.prepare("DELETE FROM tolerances WHERE nutrient = ?").run(key);
    return null;
  }
  // A target's direction is the same for every goal, so any goal's copy will do.
  const problem = checkTolerance(key, listTargets("maintain")[key], upTo, healthCeilings(getProfile()?.weightKg));
  if (problem) return problem;
  db.prepare("INSERT INTO tolerances (nutrient, ok_to_exceed, up_to) VALUES (?, 1, ?) ON CONFLICT (nutrient) DO UPDATE SET ok_to_exceed = 1, up_to = excluded.up_to").run(key, upTo);
  return null;
}
