import { getOnlyDay, inUse, listIngredients, listLocations, listPlacements, unusedIngredientIds } from "../../lib/queries.ts";
import { InUseToggle, isShowAll } from "../in-use-toggle.tsx";
import { addLocation, approveAllPlacements, assignIngredient, rejectAllPlacements } from "../actions.ts";
import { Areas } from "../areas.tsx";
import { PlaceForm } from "../place-form.tsx";
import { UnusedFlag } from "../flags.tsx";
import { Select } from "../select.tsx";

export default async function Kitchen({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const showAll = isShowAll((await searchParams).show);
  const areas = listLocations();
  const day = getOnlyDay();
  const hasDay = day.versions.some((v) => v.status === "approved");
  const used = inUse(day).ingredients;
  const unused = unusedIngredientIds();
  const placements = listPlacements();
  const placedIds = new Set(placements.map((p) => p.ingredient_id));
  const proposedCount = placements.filter((p) => p.status === "proposed").length;
  const approved = listIngredients("approved");
  const ingredients = showAll ? approved : approved.filter((i) => used.has(i.id));
  const unusedCount = ingredients.filter((i) => unused.has(i.id)).length;
  const short = (name: string) => name.split(",")[0];
  const unplaced = ingredients.filter((i) => !placedIds.has(i.id));

  return (
    <>
      <h1>Kitchen</h1>
      <p className="lede">Name the places food lives: Pantry, Fridge top shelf, Freezer. Click a name to rename it, drag the handle or use the arrows to reorder. An ingredient can live in more than one place.</p>

      <div className="row" style={{ marginBottom: 14 }}>
        <InUseToggle showAll={showAll} used={approved.filter((i) => used.has(i.id)).length} total={approved.length} href={(all) => (all ? "/kitchen?show=all" : "/kitchen")} />
      </div>
      {unusedCount > 0 && <p className="muted flag-legend"><UnusedFlag /> {unusedCount} ingredient{unusedCount === 1 ? " isn't" : "s aren't"} in any meal yet.</p>}
      {areas.length > 0 && hasDay && <PlaceForm />}
      {proposedCount > 0 && (
        <div className="notice" role="status">
          <span>{proposedCount} proposed placement{proposedCount === 1 ? "" : "s"} from the AI, shown in plum below.</span>
          <form action={approveAllPlacements}><button className="primary">Approve all</button></form>
          <form action={rejectAllPlacements}><button>Reject all</button></form>
        </div>
      )}
      {areas.length === 0 ? <p className="empty">No areas yet. Name your first one below.</p> : (
        <Areas areas={areas.map((a) => ({
          id: a.id, name: a.name,
          items: ingredients.flatMap((i) => {
            const p = placements.find((x) => x.ingredient_id === i.id && x.location_id === a.id);
            return p ? [{ id: i.id, name: short(i.name), proposed: p.status === "proposed", unused: unused.has(i.id) }] : [];
          }),
        }))} />
      )}

      <form action={addLocation} className="add">
        <input name="name" aria-label="Area name" placeholder="New area (Fridge door)" required />
        <button className="primary">Add area</button>
      </form>
      {areas.length > 0 && (
        <form action={assignIngredient} className="add" style={{ borderTop: 0, paddingTop: 0 }}>
          <Select name="ingredient" required placeholder="Choose an ingredient…" options={ingredients.map((i) => ({ value: String(i.id), label: i.name, hint: unused.has(i.id) ? "not in any meal" : undefined }))} />
          <span className="muted">goes in</span>
          <Select name="location" required placeholder="Choose an area…" options={areas.map((l) => ({ value: String(l.id), label: l.name }))} />
          <button className="primary">Put it there</button>
        </form>
      )}

      <h2>Not placed yet ({unplaced.length})</h2>
      {unplaced.length === 0 ? <p className="muted">Everything has a home.</p> : (
        <ul className="plain-chips">
          {unplaced.map((i) => (
            <li key={i.id} className="chip">{short(i.name)}{unused.has(i.id) && <UnusedFlag />}</li>
          ))}
        </ul>
      )}
    </>
  );
}
