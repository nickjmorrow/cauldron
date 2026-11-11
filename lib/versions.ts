import { GOALS, type Goal } from "./calculators.ts";

export type DayKind = "workout" | "rest";
export type VersionKey = { kind: DayKind; goal: Goal };

// What a day opens on when nothing else is asked for.
const DEFAULT_KEY: VersionKey = { kind: "rest", goal: "maintain" };

// Reads ?goal=&kind= from the URL; anything unrecognised becomes the default.
export function parseVersionKey(params: { goal?: string; kind?: string }): VersionKey {
  return {
    goal: GOALS.find((g) => g.value === params.goal)?.value ?? DEFAULT_KEY.goal,
    kind: params.kind === "workout" || params.kind === "rest" ? params.kind : DEFAULT_KEY.kind,
  };
}

// The exact version if it exists, else one with the same goal, else the same kind, else the first.
export function nearestVersion<T extends VersionKey>(versions: T[], want: VersionKey = DEFAULT_KEY): T | undefined {
  return versions.find((v) => v.kind === want.kind && v.goal === want.goal)
    ?? versions.find((v) => v.goal === want.goal)
    ?? versions.find((v) => v.kind === want.kind)
    ?? versions[0];
}

const capitalise = (word: string) => word[0].toUpperCase() + word.slice(1);

export function versionLabel(v: VersionKey): string {
  return `${capitalise(v.goal)} · ${capitalise(v.kind)}`;
}
