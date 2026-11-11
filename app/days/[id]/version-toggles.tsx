import Link from "next/link";
import { GOALS } from "../../../lib/calculators.ts";
import type { DayKind, VersionKey } from "../../../lib/versions.ts";

const KINDS: { value: DayKind; label: string }[] = [{ value: "workout", label: "Workout" }, { value: "rest", label: "Rest" }];

// Switch between the overview, the base day and the six versions. Each of Goal and Day keeps the other setting;
// a dot marks a version that differs from the base day.
export function VersionToggles({ dayId, versions, current }: {
  dayId: number;
  versions: (VersionKey & { adjustments: unknown[] })[];
  current: VersionKey | "base" | "overview"; // which page is showing
}) {
  const href = (goal: string, kind: string) => `/days/${dayId}?goal=${goal}&kind=${kind}`;
  const adjusted = (goal: string, kind: string) => versions.some((v) => v.goal === goal && v.kind === kind && v.adjustments.length > 0);
  const version = typeof current === "object" ? current : null;
  const lastKind = version?.kind ?? "rest", lastGoal = version?.goal ?? "maintain";
  return (
    <div className="toggles">
      <div className="toggle-group" role="group" aria-label="Overview and base day">
        <Link href={`/days/${dayId}?view=overview`} aria-current={current === "overview" ? "true" : undefined} className="toggle">Overview</Link>
        <Link href={`/days/${dayId}?view=base`} aria-current={current === "base" ? "true" : undefined} className="toggle">Base day</Link>
      </div>
      <div className="toggle-group" role="group" aria-label="Goal">
        {GOALS.map((g) => (
          <Link key={g.value} href={href(g.value, lastKind)} aria-current={g.value === version?.goal ? "true" : undefined}
            className={`toggle${adjusted(g.value, lastKind) ? " adjusted" : ""}`}>{g.label}</Link>
        ))}
      </div>
      <div className="toggle-group" role="group" aria-label="Day">
        {KINDS.map((k) => (
          <Link key={k.value} href={href(lastGoal, k.value)} aria-current={k.value === version?.kind ? "true" : undefined}
            className={`toggle${adjusted(lastGoal, k.value) ? " adjusted" : ""}`}>{k.label}</Link>
        ))}
      </div>
    </div>
  );
}
