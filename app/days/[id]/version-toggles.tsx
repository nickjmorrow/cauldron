import Link from "next/link";
import { GOALS } from "../../../lib/calculators.ts";
import type { VersionKey } from "../../../lib/versions.ts";

// Switch between the overview, the base day and the versions; a dot marks a version that differs from the base day.
export function VersionToggles({ dayId, versions, current }: {
  dayId: number;
  versions: (VersionKey & { adjustments: unknown[] })[];
  current: VersionKey | "base" | "overview"; // which page is showing
}) {
  const adjusted = (goal: string) => versions.some((v) => v.goal === goal && v.adjustments.length > 0);
  const version = typeof current === "object" ? current : null;
  return (
    <div className="toggles">
      <div className="toggle-group" role="group" aria-label="Overview and base day">
        <Link href={`/days/${dayId}?view=overview`} aria-current={current === "overview" ? "true" : undefined} className="toggle">Overview</Link>
        <Link href={`/days/${dayId}?view=base`} aria-current={current === "base" ? "true" : undefined} className="toggle">Base day</Link>
      </div>
      <div className="toggle-group" role="group" aria-label="Goal">
        {GOALS.map((g) => (
          <Link key={g.value} href={`/days/${dayId}?goal=${g.value}`} aria-current={g.value === version?.goal ? "true" : undefined}
            className={`toggle${adjusted(g.value) ? " adjusted" : ""}`}>{g.label}</Link>
        ))}
      </div>
    </div>
  );
}
