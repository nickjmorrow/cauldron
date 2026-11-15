import { blockHeight, type Block } from "../../../lib/ghost.ts";

// Pixels per kcal, and the least a block may shrink to so a small meal stays readable.
export type Scale = { px: number; min: number };
export const EDITOR: Scale = { px: 0.1, min: 46 };
export const MINI: Scale = { px: 0.085, min: 18 };

// One meal as a block as tall as its calories. The dashed ghost is the base portion: it shows what a resize
// took away, sits inside a block that grew, and is all that is left of a dropped meal.
// `addedTag` names where an added food belongs ("added for Bulk"); without it an added food reads like any other meal.
export function BlockCell({ block, scale, compact, tag, addedTag }: { block: Block; scale: Scale; compact?: boolean; tag?: string; addedTag?: string }) {
  const { option, status, baseKcal, kcal, factor } = block;
  // The outline only says something when the portion changed or the meal was dropped.
  const ghostHeight = baseKcal && (status === "dropped" || kcal !== baseKcal) ? blockHeight(baseKcal, scale.px, scale.min) : 0;
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
        <div className={`gh-blk${block.odd ? " odd" : ""}`} style={{ height }}>
          <div className="gh-t">
            <b>{name}{status === "added" && addedTag && !compact && <em className="added-tag">{addedTag}</em>}{block.odd && !compact && <em className="odd-tag">much {block.odd} than the others</em>}</b>
            <span>{kcal} kcal{!compact && ` · ${Math.round(option.meal.totals.protein ?? 0)} g protein`}{tag ? ` ${tag}` : ""}{factor !== 1 && !compact ? ` · ×${factor}` : ""}</span>
          </div>
        </div>
      )}
    </div>
  );
}
