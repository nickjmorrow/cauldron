import Link from "next/link";
import { getOnlyDay, inUse, listMeals, occasionalUse } from "../../lib/queries.ts";
import { countByUse, UseFilterToggle } from "../in-use-toggle.tsx";
import { UseTag } from "../flags.tsx";
import { parseUseFilter, useOf } from "../../lib/usage.ts";
import { createMeal, renamePart } from "../actions.ts";
import { RenameLabel } from "../rename.tsx";
import { mealBoard, mealSlots, nextMealSort, slotTotals, parseMealSort, sortMeals, firstDir, type MealSort, type MealSortKey } from "../../lib/meal-list.ts";

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
  // The day's own meals are drawn the way the day is built (below); every other meal is a row in the table.
  // What an approved version adds to a slot (a second breakfast when bulking) belongs to that slot, as a sometimes.
  const extras = onlyDay.versions.filter((v) => v.status === "approved").flatMap((v) =>
    v.adjustments.flatMap((a) => (a.kind === "add" && a.mealId !== null ? [{ slotId: a.slotId, mealId: a.mealId, version: v.goal }] : [])));
  const board = mealBoard(meals, onlyDay.slots, extras);
  const capitalise = (word: string) => word[0].toUpperCase() + word.slice(1);
  type Listed = (typeof meals)[number];
  // One line of the menu: the dish, a dotted leader, what it weighs in at. Protein only where there's room for it.
  const dish = (m: Listed, on: boolean, roomy: boolean) => (
    <div className={on ? "menu-dish on" : "menu-dish"} title={`${round(m.totals.protein)} g protein · ${round(m.totals.carbs)} g carbs · ${round(m.totals.fat)} g fat`}>
      <Link href={`/meals/${m.id}`}>{m.name}</Link>
      {on && <span className="sr-only"> (planned)</span>}
      {m.status === "proposed" && <span className="badge proposed">proposed</span>}
      <span className="menu-dots" aria-hidden="true" />
      <span className="menu-kcal">{m.items.length === 0 ? "–" : <>{round(m.totals.calories)}{roomy ? ` · ${round(m.totals.protein)} g protein` : <span className="sr-only"> kcal</span>}</>}</span>
    </div>
  );
  const round = (n: number | undefined) => Math.round(n ?? 0);
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
      {board.slots.length > 0 && (
        <div className="menu">
          {board.slots.map((slot) => {
            const kcal = slotTotals(slot.parts, "calories");
            const swaps = slot.parts.some((p) => p.meals.length > 1);
            const roomy = slot.parts.length + (slot.sometimes.length > 0 ? 1 : 0) <= 2;
            return (
              <section key={slot.id} className="menu-slot" aria-labelledby={`menu-${slot.id}`}>
                <div>
                  <h2 id={`menu-${slot.id}`} className="menu-name">{slot.name}</h2>
                  {slot.parts.length > 0 && (
                    <p className="menu-total"><b>{round(kcal.planned)}</b> kcal as planned
                      {swaps && <span>{round(kcal.low)} to {round(kcal.high)} across the swaps</span>}</p>
                  )}
                </div>
                <ol className="menu-parts">
                  {slot.parts.map((part, index) => (
                    <li key={part.part} className="menu-part">
                      <h3>{index > 0 && <i>with </i>}
                        <RenameLabel id={part.part} name={part.name} action={renamePart.bind(null, slot.id)}
                          unnamed={<span className="unnamed">{part.meals.length > 1 ? `One of ${part.meals.length}` : "Every time"}</span>} />
                      </h3>
                      {part.meals.map((m, n) => (
                        <div key={m.id}>
                          {n > 0 && <div className="menu-or">or</div>}
                          {dish(m, m === part.planned, roomy)}
                        </div>
                      ))}
                    </li>
                  ))}
                  {slot.sometimes.length > 0 && (
                    <li className="menu-part sometimes">
                      <h3><i>sometimes with </i>{[...new Set(slot.sometimes.flatMap((e) => e.versions))].map(capitalise).join(", ")} only</h3>
                      {slot.sometimes.map((e) => <div key={e.meal.id}>{dish(e.meal, false, roomy)}</div>)}
                    </li>
                  )}
                </ol>
              </section>
            );
          })}
        </div>
      )}
      {board.slots.length > 0 && board.rest.length > 0 && <h2>{filter === "day" ? "Also in the day" : "Other meals"}</h2>}
      {board.rest.length > 0 && (
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
            {board.rest.map((m) => (
              <tr key={m.id} className={m.status}>
                <td><Link href={`/meals/${m.id}`}>{m.name}</Link>
                  {m.status === "proposed" && <span className="badge proposed">proposed</span>}
                  {filter === "all" && <UseTag use={use(m)} />}</td>
                <td className="muted">{m.typical_slot}</td>
                {(["calories", "protein", "carbs", "fat"] as const).map((k) => <td key={k} className="num">{m.items.length === 0 ? "–" : round(m.totals[k])}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
      <form action={createMeal} className="add">
        <input name="name" aria-label="Meal name" placeholder="New meal name" required />
        <input name="slot" aria-label="Usual slot" placeholder="Usual slot (Dinner)" />
        {filter === "occasional" && <input type="hidden" name="occasional" value="1" />}
        <button className="primary">Add meal</button>
      </form>
    </>
  );
}
