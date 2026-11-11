import type { Nutrients } from "../../../lib/nutrients.ts";
import { blockHeight, type Block } from "../../../lib/ghost.ts";

// Pixels per kcal, and the least a block may shrink to so a small meal stays readable.
export type Scale = { px: number; min: number };
export const EDITOR: Scale = { px: 0.17, min: 30 };
export const MINI: Scale = { px: 0.085, min: 18 };

// Protein, carbs and fat as a share of the meal's macro calories.
export function MacroStripe({ totals }: { totals: Nutrients }) {
  const p = (totals.protein ?? 0) * 4, c = (totals.carbs ?? 0) * 4, f = (totals.fat ?? 0) * 9;
  const all = p + c + f;
  if (!all) return <i className="stripe" />;
  const a = (p / all) * 100, b = a + (c / all) * 100;
  return <i className="stripe" style={{ background: `linear-gradient(to bottom, var(--protein) 0 ${a}%, var(--carbs) ${a}% ${b}%, var(--fat) ${b}% 100%)` }} />;
}

// One meal as a block as tall as its calories. The dashed ghost is the base portion: it shows what a resize
// took away, sits inside a block that grew, and is all that is left of a dropped meal.
export function BlockCell({ block, scale, compact, tag }: { block: Block; scale: Scale; compact?: boolean; tag?: string }) {
  const { option, status, baseKcal, kcal, factor } = block;
  const ghostHeight = baseKcal ? blockHeight(baseKcal, scale.px, scale.min) : 0;
  const height = status === "dropped" ? 0 : blockHeight(kcal, scale.px, scale.min);
  const name = option.meal.name;
  return (
    <div className="gh-cell" style={{ height: Math.max(ghostHeight, height) }}>
      {ghostHeight > 0 && (
        <div className="gh-ghost" style={{ height: ghostHeight }}>
          {status === "dropped" ? <span className="gh-gone"><s>{name}</s>{!compact && " · dropped"}</span> : !compact && kcal < baseKcal ? <small>−{baseKcal - kcal} kcal</small> : null}
        </div>
      )}
      {height > 0 && (
        <div className={`gh-blk${status === "added" ? " add" : ""}`} style={{ height }}>
          <MacroStripe totals={option.meal.totals} />
          <div className="gh-t">
            <b>{status === "added" && "+ "}{name}</b>
            <span>{kcal}{tag ? ` ${tag}` : ""}{factor !== 1 && !compact ? ` · ×${factor}` : ""}</span>
          </div>
        </div>
      )}
    </div>
  );
}
