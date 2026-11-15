import { GOALS, type Goal } from "./calculators.ts";

export type VersionKey = { goal: Goal };

// What a day opens on when nothing else is asked for.
const DEFAULT_KEY: VersionKey = { goal: "bulk" };

// Reads ?goal= from the URL; anything unrecognised becomes the default.
export function parseVersionKey(params: { goal?: string }): VersionKey {
  return { goal: GOALS.find((g) => g.value === params.goal)?.value ?? DEFAULT_KEY.goal };
}

// The exact version if it exists, else the first.
export function nearestVersion<T extends VersionKey>(versions: T[], want: VersionKey = DEFAULT_KEY): T | undefined {
  return versions.find((v) => v.goal === want.goal) ?? versions[0];
}

export function versionLabel(v: VersionKey): string {
  return v.goal[0].toUpperCase() + v.goal.slice(1);
}
