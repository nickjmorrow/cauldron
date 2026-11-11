import { getDb } from "./db.ts";

// Foods the user likes for each meal of the day. Suggested fixes add from these (and from what the base day already uses).
export type Like = { ingredientId: number; name: string; slotName: string; status: "proposed" | "approved" };

export function listLikes(): Like[] {
  const rows = getDb().prepare(
    `SELECT l.ingredient_id, i.name, l.slot_name, l.status FROM liked_foods l JOIN ingredients i ON i.id = l.ingredient_id ORDER BY l.slot_name, i.name`,
  ).all() as { ingredient_id: number; name: string; slot_name: string; status: Like["status"] }[];
  return rows.map((r) => ({ ingredientId: r.ingredient_id, name: r.name, slotName: r.slot_name, status: r.status }));
}

// Returns why a food can't be liked, or null when saved. Liking something already approved keeps it approved.
export function likeFood(ingredientId: number, slotName: string, status: "proposed" | "approved" = "approved"): string | null {
  const db = getDb();
  const food = db.prepare("SELECT name, status, contains_dairy FROM ingredients WHERE id = ?").get(ingredientId) as { name: string; status: string; contains_dairy: number } | undefined;
  if (!food) return "That isn't a known food.";
  if (food.contains_dairy) return `${food.name} contains dairy, and you're dairy-free, so it isn't offered in suggestions.`;
  if (food.status !== "approved") return `${food.name} isn't approved yet; approve it on the Review page first.`;
  db.prepare("INSERT INTO liked_foods (ingredient_id, slot_name, status) VALUES (?, ?, ?) ON CONFLICT (ingredient_id, slot_name) DO NOTHING").run(ingredientId, slotName, status);
  return null;
}

export function unlikeFood(ingredientId: number, slotName: string) {
  getDb().prepare("DELETE FROM liked_foods WHERE ingredient_id = ? AND slot_name = ?").run(ingredientId, slotName);
}

export function approveLike(ingredientId: number, slotName: string) {
  getDb().prepare("UPDATE liked_foods SET status = 'approved' WHERE ingredient_id = ? AND slot_name = ?").run(ingredientId, slotName);
}

// Only a proposed like can be rejected; an approved one is removed with unlikeFood.
export function rejectLike(ingredientId: number, slotName: string) {
  getDb().prepare("DELETE FROM liked_foods WHERE ingredient_id = ? AND slot_name = ? AND status = 'proposed'").run(ingredientId, slotName);
}

// Liked foods are kept by slot name, so a renamed slot takes them with it.
export function renameLikedSlot(from: string, to: string) {
  getDb().prepare("UPDATE OR IGNORE liked_foods SET slot_name = ? WHERE slot_name = ?").run(to, from);
}

export type LikesDraft = { likes: { slot: string; foods: string[] }[] };

// Cuts what the AI returned down to foods and meals that exist; whatever didn't match is reported back.
export function validLikes(draft: LikesDraft, ingredients: { id: number; name: string }[], slotNames: string[]): { pairs: { ingredientId: number; slotName: string }[]; unmatched: string[] } {
  const byName = new Map(ingredients.map((i) => [i.name.toLowerCase(), i.id]));
  const slots = new Map(slotNames.map((s) => [s.toLowerCase(), s]));
  const pairs: { ingredientId: number; slotName: string }[] = [];
  const unmatched = new Set<string>();
  for (const like of draft.likes ?? []) {
    const slotName = slots.get(String(like.slot).toLowerCase());
    if (!slotName) { unmatched.add(`meal “${like.slot}”`); continue; }
    for (const food of like.foods ?? []) {
      const id = byName.get(String(food).toLowerCase());
      if (id === undefined) unmatched.add(String(food));
      else if (!pairs.some((p) => p.ingredientId === id && p.slotName === slotName)) pairs.push({ ingredientId: id, slotName });
    }
  }
  return { pairs, unmatched: [...unmatched] };
}
