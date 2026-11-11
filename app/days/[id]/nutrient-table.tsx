import type { ReactNode } from "react";
import { NUTRIENT_GROUPS, type NutrientKey } from "../../../lib/nutrients.ts";
import { judge, type Target, type Verdict } from "../../../lib/compute.ts";
import { partKey, totalsForChoice, variantCombos, type Slot } from "../../../lib/queries.ts";
import { topContributors } from "../../../lib/contributors.ts";
import type { DayKind } from "../../../lib/versions.ts";
import { CellPopover } from "./cell-popover.tsx";

const round1 = (n: number) => Math.round(n * 10) / 10;

// Totals for each variation of the day against the targets. Hovering a cell lists the meals that contribute most;
// `extra` adds more to the popover of a cell that is off target (the fix link).
export function NutrientTable({ slots, targets, kind, extra }: {
  slots: Slot[];
  targets: Record<string, Target>;
  kind: DayKind | null; // null: no targets to compare with (the base day)
  extra?: (key: NutrientKey, info: { verdict: Verdict; over: boolean }) => ReactNode;
}) {
  const combos = variantCombos({ slots });
  const cols = combos.map((c) => totalsForChoice({ slots }, c));
  const varying = slots.flatMap((s) => s.parts.filter((p) => p.options.length > 1).map((p) => ({ slot: s, part: p })));
  const isPlanned = (c: Record<string, number>) =>
    varying.every(({ slot, part }) => part.options.find((o) => o.optionId === c[partKey(slot.id, part.part)])?.isPlanned);
  const label = (c: Record<string, number>) =>
    varying.length ? varying.map(({ slot, part }) => part.options.find((o) => o.optionId === c[partKey(slot.id, part.part)])!.meal.name).join(" + ") : "Planned day";

  return (
    <section aria-label="Nutrients">
      <h2 style={{ marginTop: 0 }}>Nutrients{varying.length ? ` · ${combos.length} variation${combos.length > 1 ? "s" : ""} side by side` : ""}</h2>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Nutrient</th><th className="num">Target</th>
            {combos.map((c, i) => <th key={i} className="num">{label(c)}{isPlanned(c) && varying.length > 0 ? " (planned)" : ""}</th>)}</tr></thead>
          <tbody>
            {NUTRIENT_GROUPS.map((g) => [
              <tr key={g.name} className="group"><th colSpan={2 + combos.length}>{g.name}</th></tr>,
              ...g.items.map((n) => {
                const t = kind ? targets[n.key] : undefined;
                const target = t ? (t.daily ?? (kind === "workout" ? t.workout : t.rest)) : null;
                return (
                  <tr key={n.key}>
                    <td>{n.label} <span className="muted">{n.unit}</span></td>
                    <td className="num muted">{target ?? "–"}</td>
                    {cols.map((totals, i) => {
                      const v = totals[n.key];
                      const j = v !== undefined && target ? judge(v, target, t!.type) : null;
                      const who = v ? topContributors(slots, combos[i], n.key, 4) : null;
                      const cell = <>{v === undefined ? "–" : round1(v)}{j && <span className="pct">{Math.round(j.pct * 100)}%</span>}</>;
                      if (!who?.items.length) return <td key={i} className={`num ${j?.verdict ?? ""}`}>{cell}</td>;
                      return (
                        <CellPopover key={i} className={`num ${j?.verdict ?? ""}`} popover={
                          <>
                            <div className="pop-title">{n.label}{j && target ? <span className="muted"> · {Math.round(j.pct * 100)}% of {target} {n.unit}</span> : null}</div>
                            <div className="muted pop-sub">Main contributors</div>
                            <ol className="pop-list">
                              {who.items.map((c) => (
                                <li key={`${c.slot}-${c.meal}`}>
                                  <span>{c.meal}<small className="muted"> {c.slot}</small></span>
                                  <b>{round1(c.amount)} {n.unit}</b>
                                  <i>{Math.round(c.share * 100)}%</i>
                                </li>
                              ))}
                            </ol>
                            {j && j.verdict !== "good" && extra?.(n.key, { verdict: j.verdict, over: j.pct > 1 })}
                          </>
                        }>{cell}</CellPopover>
                      );
                    })}
                  </tr>
                );
              }),
            ])}
          </tbody>
        </table>
      </div>
    </section>
  );
}
