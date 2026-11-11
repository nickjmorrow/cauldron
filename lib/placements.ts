// What the model returns for "which kitchen area does each ingredient live in".
export type PlacementDraft = { placements: { ingredient: string; areas: string[] }[] };

export function validPlacements(draft: PlacementDraft, ingredients: Map<string, number>, areas: Map<string, number>) {
  const pairs: { ingredientId: number; locationId: number }[] = [];
  const unmatched: string[] = [];
  const seen = new Set<string>();
  for (const p of draft.placements ?? []) {
    const ingredientId = ingredients.get(p.ingredient);
    if (ingredientId === undefined) { unmatched.push(p.ingredient); continue; }
    for (const name of (p.areas ?? []).slice(0, 2)) {
      const locationId = areas.get(name);
      const key = `${ingredientId}:${locationId}`;
      if (locationId === undefined) unmatched.push(`${p.ingredient} → ${name}`);
      else if (!seen.has(key)) { seen.add(key); pairs.push({ ingredientId, locationId }); }
    }
  }
  return { pairs, unmatched };
}
