import Link from "next/link";
import { GOALS, type Goal } from "../../../lib/calculators.ts";
import { judge, type Target } from "../../../lib/compute.ts";
import { ghostSlots } from "../../../lib/ghost.ts";
import { averageTotals, type Day } from "../../../lib/queries.ts";
import type { Block } from "../../../lib/ghost.ts";
import { BlockCell, MINI } from "./blocks.tsx";

const capitalise = (word: string) => word[0].toUpperCase() + word.slice(1);

// A meal with variations, drawn as one block at their average size.
function choices(live: Block[]): Block {
  const kcal = Math.round(live.reduce((sum, b) => sum + b.kcal, 0) / live.length);
  const option = { ...live[0].option, meal: { ...live[0].option.meal, name: `${live.length} choices`, totals: { calories: kcal } } };
  return { ...live[0], option, kcal, baseKcal: Math.round(live.reduce((sum, b) => sum + b.baseKcal, 0) / live.length), factor: 1, odd: undefined };
}

// The versions side by side on one scale, each over the base day's outline. Opening one goes to its editor.
export function Overview({ day, calories }: { day: Day; calories: Record<Goal, Target | undefined> }) {
  return (
    <div className="gh-grid">
      {GOALS.map(({ value: goal }) => {
        const version = day.versions.find((v) => v.goal === goal);
        const slots = ghostSlots(day.slots, version?.slots ?? day.slots);
        const total = Math.round(averageTotals(version?.slots ?? day.slots).calories ?? 0);
        const t = calories[goal];
        const target = t?.daily ?? null;
        const verdict = target ? judge(total, target, t!.type).verdict : "none";
        const changes = version?.adjustments.length ?? 0;
        return (
          <Link key={goal} href={`/days/${day.id}?goal=${goal}`} className="gh-mini" aria-label={`Open the ${goal} version`}>
            <h3>{capitalise(goal)}<span className={verdict}>{total.toLocaleString()}{target ? ` / ${Math.round(target).toLocaleString()}` : ""}</span></h3>
            <div className="gh-col">
              {slots.map((slot) => (
                <div key={slot.id}>
                  <div className="gh-sl">{slot.name}</div>
                  {slot.parts.map((p) => {
                    const live = p.options.filter((b) => b.status !== "dropped");
                    return <BlockCell key={p.part} block={live.length > 1 ? choices(live) : (live[0] ?? p.options[0])} scale={MINI} compact />;
                  })}
                  {slot.added.map((b) => <BlockCell key={b.option.optionId} block={b} scale={MINI} compact />)}
                </div>
              ))}
            </div>
            <p className="muted gh-foot">{changes === 0 ? "same as the base day" : `${changes} change${changes > 1 ? "s" : ""} from the base day`}</p>
          </Link>
        );
      })}
    </div>
  );
}
