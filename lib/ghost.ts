import type { Slot, SlotOption } from "./queries.ts";

// A version's meal set against the base day: what each base meal became (resized, dropped) and what was added.
export type Block = {
  option: SlotOption; // the resolved option, or the base one when dropped
  status: "base" | "dropped" | "added";
  planned: boolean;
  baseKcal: number; // 0 for an added food
  kcal: number; // 0 for a dropped meal
  factor: number;
  odd?: "bigger" | "smaller"; // far from the other variations of the same meal
};
export type GhostPart = { part: number; options: Block[] };
export type GhostSlot = { id: number; name: string; parts: GhostPart[]; added: Block[] };

const kcal = (o: SlotOption) => Math.round(o.meal.totals.calories ?? 0);

// `resolved` is the version's slots as resolveVersion returns them: same slots in the same order, dropped meals gone, added foods as extra parts.
export function ghostSlots(base: Slot[], resolved: Slot[]): GhostSlot[] {
  return base.map((slot, i) => {
    const mine = new Map(resolved[i].parts.flatMap((p) => p.options.map((o) => [o.optionId, o] as const)));
    const parts = slot.parts.map((p) => ({
      part: p.part,
      options: p.options.map((o): Block => {
        const now = mine.get(o.optionId);
        if (!now) return { option: o, status: "dropped", planned: false, baseKcal: kcal(o), kcal: 0, factor: 1 };
        return { option: now, status: "base", planned: now.isPlanned, baseKcal: kcal(o), kcal: kcal(now), factor: now.adjust?.kind === "scale" ? now.adjust.factor : 1 };
      }),
    }));
    const added = resolved[i].parts.flatMap((p) => p.options.filter((o) => o.adjust?.kind === "add"))
      .map((o): Block => ({ option: o, status: "added", planned: true, baseKcal: 0, kcal: kcal(o), factor: 1 }));
    return { id: slot.id, name: slot.name, parts: parts.map((p) => ({ ...p, options: markOdd(p.options) })), added };
  });
}

// A variation this far from the middle of its meal's variations (in kcal, or as a share of it) makes the typical day misleading.
const ODD_KCAL = 150;
const ODD_SHARE = 0.35;

// Flags the variations that are much bigger or smaller than the middle one of their meal.
export function markOdd(blocks: Block[]): Block[] {
  const live = blocks.filter((b) => b.status !== "dropped").map((b) => b.kcal).sort((a, b) => a - b);
  if (live.length < 2) return blocks;
  const mid = live.length % 2 ? live[(live.length - 1) / 2] : (live[live.length / 2 - 1] + live[live.length / 2]) / 2;
  return blocks.map((b) => {
    if (b.status === "dropped" || Math.abs(b.kcal - mid) <= Math.max(ODD_KCAL, ODD_SHARE * mid)) return b;
    return { ...b, odd: b.kcal > mid ? "bigger" : "smaller" };
  });
}

export const blockHeight = (calories: number, pxPerKcal: number, min: number) => Math.max(min, calories * pxPerKcal);
