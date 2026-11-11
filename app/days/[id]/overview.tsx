import Link from "next/link";
import { GOALS, type Goal } from "../../../lib/calculators.ts";
import { judge, type Target } from "../../../lib/compute.ts";
import { ghostSlots } from "../../../lib/ghost.ts";
import { totalsForChoice, type Day } from "../../../lib/queries.ts";
import type { DayKind } from "../../../lib/versions.ts";
import { BlockCell, MINI } from "./blocks.tsx";

const KINDS: DayKind[] = ["rest", "workout"];
const capitalise = (word: string) => word[0].toUpperCase() + word.slice(1);

// The six versions side by side on one scale, each over the base day's outline. Opening one goes to its editor.
export function Overview({ day, calories }: { day: Day; calories: Record<Goal, Target | undefined> }) {
  return (
    <div className="gh-grid">
      {KINDS.flatMap((kind) => GOALS.map(({ value: goal }) => {
        const version = day.versions.find((v) => v.goal === goal && v.kind === kind);
        const slots = ghostSlots(day.slots, version?.slots ?? day.slots);
        const total = Math.round(totalsForChoice({ slots: version?.slots ?? day.slots }).calories ?? 0);
        const t = calories[goal];
        const target = t ? (t.daily ?? t[kind]) : null;
        const verdict = target ? judge(total, target, t!.type).verdict : "none";
        const changes = version?.adjustments.length ?? 0;
        return (
          <Link key={`${goal}-${kind}`} href={`/days/${day.id}?goal=${goal}&kind=${kind}`} className="gh-mini" aria-label={`Open ${goal} ${kind} day`}>
            <h3>{capitalise(goal)} · {capitalise(kind)}<span className={verdict}>{total.toLocaleString()}{target ? ` / ${Math.round(target).toLocaleString()}` : ""}</span></h3>
            <div className="gh-col">
              {slots.map((slot) => (
                <div key={slot.id}>
                  <div className="gh-sl">{slot.name}</div>
                  {slot.parts.map((p) => {
                    const shown = p.options.find((b) => b.planned && b.status !== "dropped") ?? p.options.find((b) => b.status !== "dropped") ?? p.options[0];
                    const live = p.options.filter((b) => b.status !== "dropped").length;
                    return <BlockCell key={p.part} block={shown} scale={MINI} compact tag={live > 1 ? `×${live}` : undefined} />;
                  })}
                  {slot.added.map((b) => <BlockCell key={b.option.optionId} block={b} scale={MINI} compact />)}
                </div>
              ))}
            </div>
            <p className="muted gh-foot">{changes === 0 ? "same as the base day" : `${changes} change${changes > 1 ? "s" : ""} from the base day`}</p>
          </Link>
        );
      }))}
    </div>
  );
}
