import { getDb } from "./db.ts";
import { createVersion, getDay, getOnlyDay, getProfile, listIngredients, listMeals, listTargets, STUB_SERVING, type Day, type Slot } from "./queries.ts";
import { solve, totalsOf, type Goal, type Model, type PoolFood } from "./solver.ts";
import { healthCeilings, okUpTo } from "./guardrails.ts";
import { listTolerances } from "./tolerances.ts";
import { addFood, planMeal, removeMeal, resetVersion, scaleMeal } from "./adjustments.ts";
import { NUTRIENTS, type NutrientKey } from "./nutrients.ts";
import { GOALS } from "./calculators.ts";
import { judge } from "./compute.ts";
import type { Adjustment } from "./resolve.ts";
import type { DayKind, VersionKey } from "./versions.ts";

// Suggested fixes: the solver proposes, the person reviews, and only then does a version change.

// Calories and the macros matter most; limits ("no more than") count heavily; the rest count once.
const WEIGHTS: Partial<Record<NutrientKey, number>> = { calories: 4, protein: 3, carbs: 1.5, fat: 1.5 };
// Asking to fix one nutrient should win over the rest; the review shows what that costs elsewhere.
const FOCUS_BOOST = 10;
// How much of a food a suggestion may add: twice what a base meal already uses, or 3 servings of a food you said you like.
const USUAL_AMOUNT_FACTOR = 2;
const LIKED_FOOD_CAP = 3;

// Foods the solver may add to each slot: those you like there (approved), plus what the base day already uses there.
// Dairy never comes from a suggestion, and neither does anything unapproved (foods already added by hand still count toward totals, see buildModel).
export function poolFor(day: Day): PoolFood[] {
  const all = listIngredients();
  const byId = new Map(all.map((i) => [i.id, i]));
  const allowed = new Set(all.filter((i) => i.status === "approved" && !i.contains_dairy && i.serving !== STUB_SERVING).map((i) => i.id));
  const slotIds = new Map<number, Set<number>>();
  const caps = new Map<number, number>();
  const allow = (ingredientId: number, slotId: number, cap: number) => {
    slotIds.set(ingredientId, (slotIds.get(ingredientId) ?? new Set()).add(slotId));
    caps.set(ingredientId, Math.max(caps.get(ingredientId) ?? 0, cap));
  };

  for (const slot of day.slots) {
    for (const part of slot.parts) for (const option of part.options) for (const item of option.meal.items) {
      if (allowed.has(item.ingredient.id)) allow(item.ingredient.id, slot.id, USUAL_AMOUNT_FACTOR * item.qty);
    }
  }
  const liked = getDb().prepare("SELECT ingredient_id, slot_name FROM liked_foods WHERE status = 'approved'").all() as { ingredient_id: number; slot_name: string }[];
  for (const row of liked) {
    if (!allowed.has(row.ingredient_id)) continue;
    for (const slot of day.slots.filter((s) => s.name === row.slot_name)) allow(row.ingredient_id, slot.id, LIKED_FOOD_CAP);
  }
  return [...slotIds].flatMap(([id, slots]) => {
    const ingredient = byId.get(id);
    const maxQty = Math.min(4, Math.max(0.25, caps.get(id) ?? 0.25));
    return ingredient ? [{ ingredientId: id, name: ingredient.name, nutrients: ingredient.nutrients, slotIds: [...slots].sort((a, b) => a - b), maxQty }] : [];
  });
}

export function buildModel(day: Day): Model {
  return {
    options: day.slots.flatMap((slot) => slot.parts.flatMap((p) => p.options.map((o) => ({ optionId: o.optionId, slotId: slot.id, part: p.part, planned: o.isPlanned, nutrients: o.meal.totals })))),
    mealNutrients: Object.fromEntries(listMeals().map((m) => [m.id, m.totals])),
    pool: poolFor(day),
    ingredientNutrients: Object.fromEntries(listIngredients().map((i) => [i.id, i.nutrients])),
  };
}

// A target no food has any numbers for would look like a shortfall everywhere, so it isn't chased.
export function goalsWithData(model: Model, goals: Goal[]): Goal[] {
  const sources = [...model.options.map((o) => o.nutrients), ...model.pool.map((p) => p.nutrients), ...Object.values(model.ingredientNutrients ?? {}), ...Object.values(model.mealNutrients)];
  return goals.filter((g) => sources.some((n) => n[g.key] !== undefined));
}

// Dairy, anything unapproved and the "1 meal" stubs are never suggested, whoever added them.
function suggestable(adjustments: Adjustment[]): Adjustment[] {
  const ok = new Set(listIngredients().filter((i) => i.status === "approved" && !i.contains_dairy && i.serving !== STUB_SERVING).map((i) => i.id));
  return adjustments.filter((a) => a.kind !== "add" || a.ingredientId === null || ok.has(a.ingredientId));
}

// What the solver aims for: every nutrient with a target for this goal and kind, with the user's tolerances and the health ceilings.
export function goalsFor(want: VersionKey, focus: NutrientKey[] | null): Goal[] {
  const targets = listTargets(want.goal);
  const tolerances = listTolerances();
  const ceilings = healthCeilings(getProfile()?.weightKg);
  return NUTRIENTS.flatMap((n): Goal[] => {
    const t = targets[n.key];
    const target = t ? (t.daily ?? (want.kind === "workout" ? t.workout : t.rest)) : null;
    if (!t || !target) return [];
    const base = WEIGHTS[n.key] ?? (t.type === "no_more_than" ? 3 : 1);
    return [{ key: n.key, target, type: t.type, weight: focus?.includes(n.key) ? base * FOCUS_BOOST : base, okUpTo: okUpTo(tolerances[n.key], ceilings[n.key]), hardCeiling: ceilings[n.key] }];
  });
}

const normal = (list: Adjustment[]) => list.map((a) => {
  if (a.kind === "add") return `add|${a.slotId}|${a.ingredientId}|${a.mealId}|${a.qty}`;
  return `${a.kind}|${a.optionId}|${a.kind === "scale" ? a.factor : ""}`;
}).sort().join(";");

function insertProposal(versionId: number, kind: "fix" | "generate", adjustments: Adjustment[], baseline: Adjustment[], before: object, after: object, note: string): number {
  return Number(getDb().prepare("INSERT INTO proposals (version_id, kind, adjustments, base_adjustments, totals_before, totals_after, note) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(versionId, kind, JSON.stringify(adjustments), JSON.stringify(baseline), JSON.stringify(before), JSON.stringify(after), note).lastInsertRowid);
}

function versionOf(versionId: number): { day: Day; version: Day["versions"][number] } | undefined {
  const row = getDb().prepare("SELECT day_id FROM day_versions WHERE id = ?").get(versionId) as { day_id: number } | undefined;
  const day = row && getDay(row.day_id);
  const version = day?.versions.find((v) => v.id === versionId);
  return day && version ? { day, version } : undefined;
}

// Asks the solver for a better version (focusing on some nutrients, or none for all) and files it for review.
// Returns the proposal's id, or null when there is nothing worth changing.
export function createFixProposal(versionId: number, focus: NutrientKey[] | null): number | null {
  const found = versionOf(versionId);
  if (!found) return null;
  const { day, version } = found;
  const model = buildModel(day);
  const result = solve({ ...model, goals: goalsWithData(model, goalsFor(version, focus)), start: version.adjustments });
  if (normal(result.adjustments) === normal(version.adjustments)) return null;
  return insertProposal(versionId, "fix", result.adjustments, version.adjustments, result.before, result.after, focus?.join(",") ?? "");
}

const KINDS: DayKind[] = ["workout", "rest"];
const HEADLINE = new Set<NutrientKey>(["calories", "protein", "carbs", "fat"]);

// For every other version: start from this version's changes and refit them to that version's own targets.
export function createMatchAllProposals(sourceVersionId: number): number[] {
  const found = versionOf(sourceVersionId);
  if (!found) return [];
  const { day, version: source } = found;
  const model = buildModel(day);
  const ids: number[] = [];
  for (const goal of GOALS.map((g) => g.value)) {
    for (const kind of KINDS) {
      if (goal === source.goal && kind === source.kind) continue;
      const target = createVersion(day.id, kind, goal);
      const current = getDay(day.id)!.versions.find((v) => v.id === target)!;
      const result = solve({ ...model, goals: goalsWithData(model, goalsFor({ goal, kind }, null)), start: suggestable(source.adjustments) });
      if (normal(result.adjustments) === normal(current.adjustments)) continue;
      ids.push(insertProposal(target, "generate", result.adjustments, current.adjustments, totalsOf(model, current.adjustments), result.after, "all"));
    }
  }
  return ids;
}

// One suggestion for each of the six versions that can be improved with what the base day and your liked foods allow.
export function createFixAllProposals(): number[] {
  const day = getOnlyDay();
  const ids: number[] = [];
  for (const goal of GOALS.map((g) => g.value)) {
    for (const kind of KINDS) {
      const id = createFixProposal(createVersion(day.id, kind, goal), null);
      if (id !== null) ids.push(id);
    }
  }
  return ids;
}

// Applies a proposal's changes to its version in one go. Returns why it couldn't, or null when applied.
export function acceptProposal(id: number): string | null {
  const db = getDb();
  const p = db.prepare("SELECT version_id, adjustments, base_adjustments, status FROM proposals WHERE id = ?").get(id) as { version_id: number; adjustments: string; base_adjustments: string; status: string } | undefined;
  if (!p || p.status !== "pending") return "That suggestion is no longer waiting for review.";
  const now = versionOf(p.version_id);
  if (!now || normal(now.version.adjustments) !== normal(JSON.parse(p.base_adjustments) as Adjustment[])) {
    return "This version has changed since the suggestion was made, so it can't be applied. Ask for a new suggestion.";
  }
  const adjustments = JSON.parse(p.adjustments) as Adjustment[];
  db.exec("BEGIN");
  try {
    resetVersion(p.version_id);
    for (const a of adjustments.filter((x) => x.kind === "remove")) removeMeal(p.version_id, (a as { optionId: number }).optionId);
    for (const a of adjustments) {
      if (a.kind === "scale") scaleMeal(p.version_id, a.optionId, a.factor);
      else if (a.kind === "plan") planMeal(p.version_id, a.optionId);
      else if (a.kind === "add") addFood(p.version_id, a.slotId, a.ingredientId !== null ? { ingredientId: a.ingredientId } : { mealId: a.mealId! }, a.qty);
    }
    db.prepare("UPDATE proposals SET status = 'accepted' WHERE id = ?").run(id);
    db.exec("COMMIT");
    return null;
  } catch {
    db.exec("ROLLBACK");
    return "The day changed since this was suggested, so it can't be applied. Ask for a new suggestion.";
  }
}

export function dismissProposal(id: number) {
  getDb().prepare("UPDATE proposals SET status = 'dismissed' WHERE id = ? AND status = 'pending'").run(id);
}

const PORTIONS: Record<number, string> = { 0.5: "½ portion", 0.75: "¾ portion", 1.25: "1¼ portions", 1.5: "1½ portions" };
const portion = (f: number) => PORTIONS[f] ?? `${f} portion`;

// What a proposal would change, in plain words, compared with the version as it stands.
export function describeChanges(base: Slot[], current: Adjustment[], proposed: Adjustment[], foods: Map<number, { name: string; serving: string }>): string[] {
  const meals = new Map(base.flatMap((s) => s.parts.flatMap((p) => p.options.map((o) => [o.optionId, o.meal.name] as const))));
  const slotName = new Map(base.map((s) => [s.id, s.name]));
  const adds = (list: Adjustment[]) => new Map(list.flatMap((a) => (a.kind === "add" ? [[`${a.slotId}|${a.ingredientId}|${a.mealId}`, a] as const] : [])));
  const nameOf = (a: Extract<Adjustment, { kind: "add" }>) => (a.ingredientId !== null ? foods.get(a.ingredientId)?.name : undefined) ?? "a food";
  const lines: string[] = [];

  const before = adds(current), after = adds(proposed);
  for (const [key, a] of after) {
    const old = before.get(key) as Extract<Adjustment, { kind: "add" }> | undefined;
    const serving = a.ingredientId !== null ? foods.get(a.ingredientId)?.serving : undefined;
    if (!old) lines.push(`Add ${a.qty} × ${nameOf(a)}${serving ? ` (${serving})` : ""} to ${slotName.get(a.slotId)}`);
    else if (old.qty !== a.qty) lines.push(`Change ${nameOf(a)} in ${slotName.get(a.slotId)} from ${old.qty} to ${a.qty}`);
  }
  for (const [key, a] of before) if (!after.has(key)) lines.push(`Take ${nameOf(a as Extract<Adjustment, { kind: "add" }>)} out of ${slotName.get((a as { slotId: number }).slotId)}`);

  const scales = (list: Adjustment[]) => new Map(list.flatMap((a) => (a.kind === "scale" ? [[a.optionId, a.factor] as const] : [])));
  const scaleBefore = scales(current), scaleAfter = scales(proposed);
  for (const [optionId, factor] of scaleAfter) if (scaleBefore.get(optionId) !== factor) lines.push(`${factor < 1 ? "Shrink" : "Enlarge"} ${meals.get(optionId)} to ${portion(factor)}`);
  for (const optionId of scaleBefore.keys()) if (!scaleAfter.has(optionId)) lines.push(`Back to a full portion of ${meals.get(optionId)}`);

  const gone = (list: Adjustment[]) => new Set(list.flatMap((a) => (a.kind === "remove" ? [a.optionId] : [])));
  const goneBefore = gone(current), goneAfter = gone(proposed);
  for (const optionId of goneAfter) if (!goneBefore.has(optionId)) lines.push(`Drop ${meals.get(optionId)}`);
  for (const optionId of goneBefore) if (!goneAfter.has(optionId)) lines.push(`Bring back ${meals.get(optionId)}`);

  const slotOfOption = new Map(base.flatMap((s) => s.parts.flatMap((p) => p.options.map((o) => [o.optionId, s.name] as const))));
  const plans = (list: Adjustment[]) => new Set(list.flatMap((a) => (a.kind === "plan" ? [a.optionId] : [])));
  const plansBefore = plans(current), plansAfter = plans(proposed);
  for (const optionId of plansAfter) if (!plansBefore.has(optionId)) lines.push(`Plan ${meals.get(optionId)} for ${slotOfOption.get(optionId)}`);
  for (const optionId of plansBefore) if (!plansAfter.has(optionId)) lines.push(`Stop planning ${meals.get(optionId)} for ${slotOfOption.get(optionId)}; the base day's choice applies`);
  return lines;
}

export type ProposalView = {
  id: number; kind: "fix" | "generate"; versionLabel: string; versionHref: string; focus: string;
  changes: string[]; rows: { label: string; unit: string; target: number; before: number; after: number }[];
};

// Everything waiting for review, ready to show: what would change in words, and how the numbers would move against the targets.
export function listPendingProposals(): ProposalView[] {
  const rows = getDb().prepare("SELECT id, version_id, kind, adjustments, totals_before, totals_after, note FROM proposals WHERE status = 'pending' ORDER BY id").all() as
    { id: number; version_id: number; kind: "fix" | "generate"; adjustments: string; totals_before: string; totals_after: string; note: string }[];
  const foods = new Map(listIngredients().map((i) => [i.id, { name: i.name, serving: i.serving }]));
  return rows.flatMap((r) => {
    const found = versionOf(r.version_id);
    if (!found) return [];
    const { day, version } = found;
    const before = JSON.parse(r.totals_before) as Record<string, number>, after = JSON.parse(r.totals_after) as Record<string, number>;
    // Calories and macros always; anything else only when its status (good, close, bad) changes.
    const shown = goalsFor(version, null).filter((g) => HEADLINE.has(g.key)
      || judge(before[g.key] ?? 0, g.target, g.type).verdict !== judge(after[g.key] ?? 0, g.target, g.type).verdict);
    return [{
      id: r.id, kind: r.kind, versionLabel: `${version.goal[0].toUpperCase()}${version.goal.slice(1)} · ${version.kind[0].toUpperCase()}${version.kind.slice(1)}`,
      versionHref: `/days/${day.id}?goal=${version.goal}&kind=${version.kind}`, focus: r.note,
      changes: describeChanges(day.slots, version.adjustments, JSON.parse(r.adjustments) as Adjustment[], foods),
      rows: shown.map((g) => { const n = NUTRIENTS.find((x) => x.key === g.key)!; return { label: n.label, unit: n.unit, target: g.target, before: before[g.key] ?? 0, after: after[g.key] ?? 0 }; }),
    }];
  });
}
