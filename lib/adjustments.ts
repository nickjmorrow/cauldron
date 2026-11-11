import { getDb } from "./db.ts";

// Changes to how a version differs from the base day. Every function checks that what it points at belongs to the version's day.
export const SCALE_MIN = 0.5;
export const SCALE_MAX = 1.5;
export const QTY_MAX = 20;

function check(ok: boolean, message: string) {
  if (!ok) throw new Error(message);
}

function ownsOption(versionId: number, optionId: number): boolean {
  return !!getDb().prepare(
    `SELECT 1 FROM slot_options o JOIN day_slots s ON s.id = o.slot_id JOIN day_versions v ON v.day_id = s.day_id WHERE o.id = ? AND v.id = ?`,
  ).get(optionId, versionId);
}

function ownsSlot(versionId: number, slotId: number): boolean {
  return !!getDb().prepare("SELECT 1 FROM day_slots s JOIN day_versions v ON v.day_id = s.day_id WHERE s.id = ? AND v.id = ?").get(slotId, versionId);
}

const checkQty = (qty: number) => check(Number.isFinite(qty) && qty > 0 && qty <= QTY_MAX, `The quantity must be more than 0 and at most ${QTY_MAX}.`);

export function removeMeal(versionId: number, optionId: number) {
  check(ownsOption(versionId, optionId), "That meal is not part of this day.");
  const db = getDb();
  db.prepare("DELETE FROM version_adjustments WHERE version_id = ? AND option_id = ? AND kind IN ('scale', 'plan')").run(versionId, optionId);
  db.prepare("INSERT OR IGNORE INTO version_adjustments (version_id, kind, option_id) VALUES (?, 'remove', ?)").run(versionId, optionId);
}

export function restoreMeal(versionId: number, optionId: number) {
  getDb().prepare("DELETE FROM version_adjustments WHERE version_id = ? AND option_id = ? AND kind = 'remove'").run(versionId, optionId);
}

// A factor of 1 is the base portion, so it clears the adjustment. Scaling a removed meal brings it back.
export function scaleMeal(versionId: number, optionId: number, factor: number) {
  check(Number.isFinite(factor) && factor >= SCALE_MIN && factor <= SCALE_MAX, `A portion must be between ${SCALE_MIN} and ${SCALE_MAX} times.`);
  check(ownsOption(versionId, optionId), "That meal is not part of this day.");
  const db = getDb();
  restoreMeal(versionId, optionId);
  if (factor === 1) {
    db.prepare("DELETE FROM version_adjustments WHERE version_id = ? AND option_id = ? AND kind = 'scale'").run(versionId, optionId);
    return;
  }
  db.prepare(
    "INSERT INTO version_adjustments (version_id, kind, option_id, factor) VALUES (?, 'scale', ?, ?) ON CONFLICT (version_id, kind, option_id) DO UPDATE SET factor = excluded.factor",
  ).run(versionId, optionId, factor);
}

// Makes this meal the planned one among its part's variations. If the base day already plans it, the version needs no row.
export function planMeal(versionId: number, optionId: number) {
  check(ownsOption(versionId, optionId), "That meal is not part of this day.");
  const db = getDb();
  const option = db.prepare("SELECT slot_id, part, is_planned FROM slot_options WHERE id = ?").get(optionId) as { slot_id: number; part: number; is_planned: number };
  db.prepare(
    `DELETE FROM version_adjustments WHERE version_id = ? AND kind = 'plan'
       AND option_id IN (SELECT id FROM slot_options WHERE slot_id = ? AND part = ?)`,
  ).run(versionId, option.slot_id, option.part);
  if (!option.is_planned) db.prepare("INSERT INTO version_adjustments (version_id, kind, option_id) VALUES (?, 'plan', ?)").run(versionId, optionId);
}

// Adds an ingredient (quantity in its servings) or a meal to a slot. Adding the same food to the same slot again adds to its quantity.
export function addFood(versionId: number, slotId: number, food: { ingredientId?: number; mealId?: number }, qty: number) {
  check((food.ingredientId === undefined) !== (food.mealId === undefined), "Choose exactly one of an ingredient or a meal.");
  checkQty(qty);
  check(ownsSlot(versionId, slotId), "That slot is not part of this day.");
  const db = getDb();
  const ingredientId = food.ingredientId ?? null, mealId = food.mealId ?? null;
  const same = db.prepare(
    "SELECT id, qty FROM version_adjustments WHERE version_id = ? AND kind = 'add' AND slot_id = ? AND ingredient_id IS ? AND meal_id IS ?",
  ).get(versionId, slotId, ingredientId, mealId) as { id: number; qty: number } | undefined;
  if (same) {
    checkQty(same.qty + qty);
    db.prepare("UPDATE version_adjustments SET qty = ? WHERE id = ?").run(same.qty + qty, same.id);
    return;
  }
  db.prepare("INSERT INTO version_adjustments (version_id, kind, slot_id, ingredient_id, meal_id, qty) VALUES (?, 'add', ?, ?, ?, ?)").run(versionId, slotId, ingredientId, mealId, qty);
}

// Zero removes the added food.
export function setAddedQty(adjustmentId: number, qty: number) {
  const db = getDb();
  if (qty === 0) {
    db.prepare("DELETE FROM version_adjustments WHERE id = ? AND kind = 'add'").run(adjustmentId);
    return;
  }
  checkQty(qty);
  db.prepare("UPDATE version_adjustments SET qty = ? WHERE id = ? AND kind = 'add'").run(qty, adjustmentId);
}

export function removeAdjustment(adjustmentId: number) {
  getDb().prepare("DELETE FROM version_adjustments WHERE id = ?").run(adjustmentId);
}

export function resetVersion(versionId: number) {
  getDb().prepare("DELETE FROM version_adjustments WHERE version_id = ?").run(versionId);
}
