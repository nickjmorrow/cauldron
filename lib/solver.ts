import type { Nutrients, NutrientKey } from "./nutrients.ts";
import type { Adjustment } from "./resolve.ts";

// Fits a version to its targets by adding foods, resizing meals and dropping meals. Pure and deterministic:
// the same input always gives the same answer. The user's own drops and planned choices are never undone.
export type SolverOption = { optionId: number; slotId: number; part: number; planned: boolean; nutrients: Nutrients }; // base meal at a full portion
export type PoolFood = { ingredientId: number; name: string; nutrients: Nutrients; slotIds: number[]; maxQty?: number }; // nutrients per serving; maxQty caps how much may be added
export type Goal = {
  key: NutrientKey;
  target: number;
  type: "at_least" | "no_more_than" | null; // null: aim for the target itself
  weight: number;
  okUpTo?: number; // being over target is fine up to here
  hardCeiling?: number; // never beyond this
};
// ingredientNutrients covers foods already added by hand even when they may not be suggested (the pool), so their totals still count.
export type Model = { options: SolverOption[]; mealNutrients: Record<number, Nutrients>; pool: PoolFood[]; ingredientNutrients?: Record<number, Nutrients> };
export type SolveInput = Model & { goals: Goal[]; start: Adjustment[]; maxSteps?: number };
export type SolveResult = { adjustments: Adjustment[]; before: Nutrients; after: Nutrients; steps: number };

const STEP = 0.25;
const FIRST_ADD = 0.5;
const MAX_ADD = 4;
const MAX_ADDED_FOODS = 6; // a suggestion stays small enough to review
const SCALE_MIN = 0.5;
// The solver only shrinks meals (the page lets you go up to 1.5 by hand): foods get added, recipes stay as they are.
const SCALE_MAX = 1;
const DEAD_BAND = 0.03; // within 3% of an aim-for target counts as on target
const EPSILON = 1e-9;

type AddRow = { id: number; slotId: number; ingredientId: number | null; mealId: number | null; qty: number };
type State = {
  removed: Set<number>;
  scale: Map<number, number>;
  planned: Set<number>;
  adds: AddRow[];
};

function stateOf(adjustments: Adjustment[]): State {
  const state: State = { removed: new Set(), scale: new Map(), planned: new Set(), adds: [] };
  for (const a of adjustments) {
    if (a.kind === "remove") state.removed.add(a.optionId);
    else if (a.kind === "scale") state.scale.set(a.optionId, a.factor);
    else if (a.kind === "plan") state.planned.add(a.optionId);
    else state.adds.push({ id: a.id, slotId: a.slotId, ingredientId: a.ingredientId, mealId: a.mealId, qty: a.qty });
  }
  return state;
}

const clone = (s: State): State => ({ removed: new Set(s.removed), scale: new Map(s.scale), planned: new Set(s.planned), adds: s.adds.map((a) => ({ ...a })) });

function groupsOf(options: SolverOption[]): SolverOption[][] {
  const groups = new Map<string, SolverOption[]>();
  for (const o of options) {
    const key = `${o.slotId}:${o.part}`;
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  return [...groups.values()];
}

// The meal eaten in a part: the planned choice among those not dropped, as the page resolves it.
function eaten(group: SolverOption[], state: State): SolverOption | undefined {
  const left = group.filter((o) => !state.removed.has(o.optionId));
  return left.find((o) => state.planned.has(o.optionId)) ?? left.find((o) => o.planned) ?? left[0];
}

function totalsOfState(model: Model, state: State): Nutrients {
  const total: Record<string, number> = {};
  const add = (n: Nutrients, by: number) => { for (const [k, v] of Object.entries(n)) total[k] = (total[k] ?? 0) + (v as number) * by; };
  for (const group of groupsOf(model.options)) {
    const option = eaten(group, state);
    if (option) add(option.nutrients, state.scale.get(option.optionId) ?? 1);
  }
  for (const a of state.adds) {
    const nutrients = a.ingredientId !== null ? (model.ingredientNutrients?.[a.ingredientId] ?? model.pool.find((p) => p.ingredientId === a.ingredientId)?.nutrients) : model.mealNutrients[a.mealId ?? -1];
    if (nutrients) add(nutrients, a.qty);
  }
  return total as Nutrients;
}

// What a version eats in total, for showing before and after.
export function totalsOf(model: Model, adjustments: Adjustment[]): Nutrients {
  return totalsOfState(model, stateOf(adjustments));
}

function goalLoss(g: Goal, total: number): number {
  const r = total / g.target - 1;
  const over = Math.max(0, r), under = Math.max(0, -r);
  let loss: number;
  if (g.type === "no_more_than") loss = (3 * over) ** 2;
  else if (g.type === "at_least") loss = under ** 2;
  else loss = Math.max(0, Math.abs(r) - DEAD_BAND) ** 2;
  // Allowed to go over: only a shortfall counts, until the allowed limit; past it the excess counts from there.
  if (g.okUpTo !== undefined && g.type !== "no_more_than") {
    loss = (g.type === null ? Math.max(0, under - DEAD_BAND) : under) ** 2 + (total > g.okUpTo ? ((total - g.okUpTo) / g.target) ** 2 : 0);
  }
  if (g.hardCeiling !== undefined && total > g.hardCeiling) loss += 100 * (1 + (total - g.hardCeiling) / g.hardCeiling) ** 2;
  return g.weight * loss;
}

// Small costs keep the answer simple: fewer added foods, smaller resizes, fewer drops. They sit below the loss of a 5% miss, so real misses still get fixed.
function changeCost(state: State, lockedRemoved: Set<number>): number {
  let cost = 0;
  for (const a of state.adds) cost += 0.008 + 0.001 * a.qty;
  for (const f of state.scale.values()) cost += (Math.abs(f - 1) / STEP) * 0.002;
  for (const id of state.removed) if (!lockedRemoved.has(id)) cost += 0.01;
  return cost;
}

type Move = (s: State) => State | undefined;

export function solve(input: SolveInput): SolveResult {
  const { goals } = input;
  const model: Model = { options: input.options, mealNutrients: input.mealNutrients, pool: input.pool, ingredientNutrients: input.ingredientNutrients };
  const start = stateOf(input.start);
  const lockedRemoved = new Set(start.removed);
  const groups = groupsOf(input.options);
  const slotOptions = (slotId: number) => input.options.filter((o) => o.slotId === slotId);
  const pool = [...input.pool].sort((a, b) => a.ingredientId - b.ingredientId);
  const options = [...input.options].sort((a, b) => a.optionId - b.optionId);

  // A slot whose meals have all been dropped takes no new foods.
  const activeSlots = (s: State) => new Set(input.options.filter((o) => !s.removed.has(o.optionId)).map((o) => o.slotId));
  const loss = (s: State) => {
    const totals = totalsOfState(model, s);
    return goals.reduce((sum, g) => sum + goalLoss(g, totals[g.key] ?? 0), 0) + changeCost(s, lockedRemoved);
  };

  const moves = (state: State): Move[] => {
    const list: Move[] = [];
    for (const food of pool) {
      const cap = Math.min(MAX_ADD, food.maxQty ?? MAX_ADD);
      for (const slotId of [...food.slotIds].sort((a, b) => a - b)) {
        if (!activeSlots(state).has(slotId)) continue;
        const row = state.adds.find((a) => a.slotId === slotId && a.ingredientId === food.ingredientId);
        if (!row && state.adds.length >= MAX_ADDED_FOODS) continue;
        const qty = row ? row.qty + STEP : Math.min(FIRST_ADD, cap);
        if (qty > cap + EPSILON) continue;
        list.push((s) => {
          const next = clone(s);
          const target = next.adds.find((a) => a.slotId === slotId && a.ingredientId === food.ingredientId);
          if (target) target.qty = qty;
          else next.adds.push({ id: 0, slotId, ingredientId: food.ingredientId, mealId: null, qty });
          return next;
        });
      }
    }
    for (const row of state.adds.filter((a) => a.ingredientId !== null)) {
      list.push((s) => {
        const next = clone(s);
        const target = next.adds.find((a) => a.slotId === row.slotId && a.ingredientId === row.ingredientId)!;
        target.qty -= STEP;
        if (target.qty < STEP - EPSILON) next.adds = next.adds.filter((a) => a !== target);
        return next;
      });
    }
    for (const o of options) {
      if (lockedRemoved.has(o.optionId) || state.removed.has(o.optionId)) continue;
      const factor = state.scale.get(o.optionId) ?? 1;
      for (const next of [factor - STEP, factor + STEP]) {
        if (next < SCALE_MIN - EPSILON || next > SCALE_MAX + EPSILON) continue;
        list.push((s) => {
          const out = clone(s);
          if (Math.abs(next - 1) < EPSILON) out.scale.delete(o.optionId); else out.scale.set(o.optionId, next);
          return out;
        });
      }
      const others = slotOptions(o.slotId).filter((x) => x.optionId !== o.optionId && !state.removed.has(x.optionId));
      if (others.length > 0) {
        list.push((s) => {
          const out = clone(s);
          out.removed.add(o.optionId);
          out.scale.delete(o.optionId);
          return out;
        });
      }
    }
    return list;
  };

  let state = clone(start);
  let current = loss(state);
  let steps = 0;
  for (; steps < (input.maxSteps ?? 120); steps++) {
    let best: State | undefined;
    let bestLoss = current - EPSILON;
    for (const move of moves(state)) {
      const next = move(state);
      if (!next) continue;
      const l = loss(next);
      if (l < bestLoss) { best = next; bestLoss = l; }
    }
    if (!best) break;
    state = best;
    current = bestLoss;
  }
  return { adjustments: adjustmentsOf(state, input.start), before: totalsOfState(model, start), after: totalsOfState(model, state), steps };
}

// Back to adjustment rows: unchanged rows keep their ids, new ones get negative ids so they can't clash with saved ones.
function adjustmentsOf(state: State, start: Adjustment[]): Adjustment[] {
  let next = -1;
  const idOf = (kind: Adjustment["kind"], optionId: number) => start.find((a) => a.kind === kind && "optionId" in a && a.optionId === optionId)?.id ?? next--;
  const out: Adjustment[] = [];
  for (const optionId of [...state.removed].sort((a, b) => a - b)) out.push({ id: idOf("remove", optionId), kind: "remove", optionId });
  for (const [optionId, factor] of [...state.scale].sort((a, b) => a[0] - b[0])) out.push({ id: idOf("scale", optionId), kind: "scale", optionId, factor });
  for (const optionId of [...state.planned].sort((a, b) => a - b)) out.push({ id: idOf("plan", optionId), kind: "plan", optionId });
  for (const a of state.adds) out.push({ id: a.id !== 0 ? a.id : next--, kind: "add", slotId: a.slotId, mealId: a.mealId, ingredientId: a.ingredientId, qty: a.qty });
  return out;
}
