import Link from "next/link";
import { getOnlyDay, inUse, listMeals, occasionalUse } from "../../lib/queries.ts";
import { countByUse, UseFilterToggle } from "../in-use-toggle.tsx";
import { UseTag } from "../flags.tsx";
import { parseUseFilter, useOf } from "../../lib/usage.ts";
import { createMeal } from "../actions.ts";
import { describeParts, mealSlots, mealsBySlot, nextMealSort, parseMealSort, sortMeals, firstDir, type MealSort, type MealSortKey } from "../../lib/meal-list.ts";

const COLUMNS: { key: MealSortKey; label: string; numeric?: boolean }[] = [
  { key: "name", label: "Meal" }, { key: "slot", label: "Usually" },
  { key: "calories", label: "kcal", numeric: true }, { key: "protein", label: "Protein g", numeric: true },
  { key: "carbs", label: "Carbs g", numeric: true }, { key: "fat", label: "Fat g", numeric: true },
];

export default async function Meals({ searchParams }: { searchParams: Promise<{ show?: string; slot?: string; sort?: string; dir?: string }> }) {
  const params = await searchParams;
  const filter = parseUseFilter(params.show);
  const sort = parseMealSort(params.sort, params.dir);
  const onlyDay = getOnlyDay();
  const day = inUse(onlyDay).meals;
  const occasional = occasionalUse().meals;
  const use = (m: { id: number }) => useOf(m.id, day, occasional);
  const everything = listMeals();
  const inFilter = filter === "all" ? everything : everything.filter((m) => use(m) === filter);
  const slots = mealSlots(inFilter);
  const slot = slots.includes(params.slot ?? "") ? params.slot : undefined;
  const meals = sortMeals(slot ? inFilter.filter((m) => m.typical_slot === slot) : inFilter, sort);
  // Laid out the way the day is built: its slots, each slot's parts, each part's swaps. The sort orders the swaps.
  const sections = mealsBySlot(meals, onlyDay.slots);
  const headed = sections.some((s) => s.slot !== null);
  // Every link keeps the other choices; defaults stay out of the address.
  const href = (to: { show?: typeof filter; slot?: string; sort?: MealSort }) => {
    const query = new URLSearchParams();
    const show = to.show ?? filter;
    const order = to.sort ?? sort;
    if (show !== "day") query.set("show", show);
    if (to.slot) query.set("slot", to.slot);
    if (order.key !== "name") query.set("sort", order.key);
    if (order.dir !== firstDir(order.key)) query.set("dir", order.dir);
    return query.size ? `/meals?${query}` : "/meals";
  };
  return (
    <>
      <h1>Meals</h1>
      <p className="lede">A meal is a list of ingredients with quantities, and how it's cooked. The typical day picks from these; mark the ones you cook now and then (cookies, a stew) as occasional on the meal's page.</p>
      <div className="row" style={{ marginBottom: 14 }}>
        <UseFilterToggle current={filter} counts={countByUse(everything, use)} href={(f) => href({ show: f, slot })} />
      </div>
      {slots.length > 1 && (
        <div className="recipe-filters" role="group" aria-label="Usually eaten at">
          <Link href={href({})} className="shop-reason" aria-pressed={!slot} replace>Any time</Link>
          {slots.map((s) => <Link key={s} href={href({ slot: s })} className="shop-reason" aria-pressed={slot === s} replace>{s}</Link>)}
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead><tr>
            {COLUMNS.map((c) => {
              const sorted = sort.key === c.key;
              return (
                <th key={c.key} className={c.numeric ? "num" : undefined} aria-sort={sorted ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}>
                  <Link href={href({ slot, sort: nextMealSort(sort, c.key) })} className="sort" replace>{c.label}{sorted && <span aria-hidden="true">{sort.dir === "asc" ? " ▲" : " ▼"}</span>}</Link>
                </th>
              );
            })}
          </tr></thead>
          <tbody>
            {sections.map((section) => [
              headed && (
                <tr key={`slot-${section.slot}`} className="group">
                  <th colSpan={COLUMNS.length}>{section.slot ?? (filter === "day" ? "Also in the day" : "Other meals")}
                    {section.slot !== null && describeParts(section.parts) && ` · ${describeParts(section.parts)}`}</th>
                </tr>
              ),
              ...section.parts.flatMap((part, p) => [
                // Several parts are eaten together (+); several meals in a part are swaps for each other.
                section.parts.length > 1 && (p > 0 || part.length > 1) && (
                  <tr key={`part-${section.slot}-${p}`} className="part">
                    <td colSpan={COLUMNS.length}>{[p > 0 && "+", part.length > 1 && `one of ${part.length}`].filter(Boolean).join(" ")}</td>
                  </tr>
                ),
                ...part.map((m) => (
                  <tr key={m.id} className={m.status}>
                    <td><Link href={`/meals/${m.id}`}>{m.name}</Link>
                      {m.status === "proposed" && <span className="badge proposed">proposed</span>}
                      {filter === "all" && <UseTag use={use(m)} />}</td>
                    <td className="muted">{m.typical_slot}</td>
                    {(["calories", "protein", "carbs", "fat"] as const).map((k) => <td key={k} className="num">{m.items.length === 0 ? "–" : Math.round(m.totals[k] ?? 0)}</td>)}
                  </tr>
                )),
              ]),
            ])}
          </tbody>
        </table>
      </div>
      <form action={createMeal} className="add">
        <input name="name" aria-label="Meal name" placeholder="New meal name" required />
        <input name="slot" aria-label="Usual slot" placeholder="Usual slot (Dinner)" />
        {filter === "occasional" && <input type="hidden" name="occasional" value="1" />}
        <button className="primary">Add meal</button>
      </form>
    </>
  );
}
