import Link from "next/link";
import { getOnlyDay, inUse, listIngredients, mealsUsing, occasionalUse } from "../../lib/queries.ts";
import { countByUse, UseFilterToggle } from "../in-use-toggle.tsx";
import { UseTag } from "../flags.tsx";
import { parseUseFilter, useOf } from "../../lib/usage.ts";
import { NUTRIENTS } from "../../lib/nutrients.ts";
import { deleteIngredient, placeIngredient, renameIngredient } from "../actions.ts";
import { RenameLabel } from "../rename.tsx";
import { Select } from "../select.tsx";
import { areaOf, CATEGORIES, groupByArea, HOMEMADE } from "../../lib/categories.ts";
import { SECTIONS } from "../../lib/sections.ts";
import { aisleTitle } from "../../lib/shopping.ts";
import { getAisleContents } from "../../lib/store-map.ts";

const SHOWN = NUTRIENTS.filter((n) => ["calories", "protein", "carbs", "fiber", "fat", "sodium"].includes(n.key));

export default async function Ingredients({ searchParams }: { searchParams: Promise<{ q?: string; show?: string }> }) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().toLowerCase();
  const filter = parseUseFilter(params.show);
  const inDay = inUse(getOnlyDay()), sometimes = occasionalUse();
  const day = inDay.ingredients;
  const occasional = sometimes.ingredients;
  const usedIn = mealsUsing();
  const holds = getAisleContents();
  const rank = (mealId: number) => (inDay.meals.has(mealId) ? 0 : sometimes.meals.has(mealId) ? 1 : 2);
  const areas = [...Object.keys(holds).sort((a, b) => Number(a) - Number(b)), ...SECTIONS, HOMEMADE];
  const use = (i: { id: number }) => useOf(i.id, day, occasional);
  const everything = listIngredients();
  const all = everything.filter((i) => (filter === "all" || use(i) === filter) && i.name.toLowerCase().includes(q));
  const href = (f: string) => `/ingredients?${new URLSearchParams({ ...(q ? { q } : {}), ...(f === "day" ? {} : { show: f }) })}`;
  return (
    <>
      <h1>Ingredients</h1>
      <p className="lede">By where they're found in the store, then by kind. Nutrients are for the serving shown. Ask for more on the Review page; they come from USDA FoodData Central.</p>
      <form className="row" role="search" style={{ marginBottom: 14 }}>
        <UseFilterToggle current={filter} counts={countByUse(everything, use)} href={href} />
        {filter !== "day" && <input type="hidden" name="show" value={filter} />}
        <input name="q" type="search" aria-label="Search ingredients" placeholder="Search ingredients" defaultValue={q} />
        <button>Search</button>
        <span className="muted">{all.length} shown</span>
      </form>
      {all.length === 0 ? <p className="empty">{q ? <>No ingredient matches “{q}”.</> : "Nothing here yet."}</p> : <>
        <form action={placeIngredient} className="add" style={{ borderTop: 0, paddingTop: 0 }}>
          <Select name="ingredient" required placeholder="Choose an ingredient…" options={all.map((i) => ({ value: String(i.id), label: i.name, hint: [aisleTitle(areaOf(i)), i.category].filter(Boolean).join(" · ") }))} />
          <span className="muted">is found in</span>
          <Select name="area" placeholder="Same place…" options={areas.map((a) => ({ value: a, label: aisleTitle(a), hint: holds[a] }))} />
          <span className="muted">as</span>
          <Select name="category" placeholder="Same category…" options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
          <button className="primary">Move it</button>
        </form>
        {groupByArea(all).map((area) => (
          <section key={area.area}>
            <h2>{aisleTitle(area.area)} ({area.count}){holds[area.area] && <span className="area-holds">{holds[area.area]}</span>}</h2>
            <div className="table-wrap">
              <table className="aligned">
                <thead><tr><th>Name</th><th>Serving</th>{SHOWN.map((n) => <th key={n.key} className="num">{n.label}</th>)}<th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {area.groups.map((g) => [
                    <tr key={g.category} className="group"><th colSpan={SHOWN.length + 3}>{g.category}</th></tr>,
                    ...g.items.map((i) => {
                      const meals = usedIn.get(i.id) ?? [];
                      return (
                        <tr key={i.id} className={i.status}>
                          <td><RenameLabel id={i.id} name={i.name} action={renameIngredient} after={<>
                            {i.status === "proposed" && <span className="badge proposed">proposed</span>}
                            {filter === "all" && <UseTag use={use(i)} />}</>} />
                            {/* The meals it's in: the typical day's first, then occasional ones, then meals that count for nothing. */}
                            <div className="used-in">{meals.length === 0 ? "in no meal" : <>in {[...meals].sort((a, b) => rank(a.id) - rank(b.id)).map((m, n) => (
                              <span key={m.id}>{n > 0 && ", "}<Link href={`/meals/${m.id}`} className={rank(m.id) === 2 ? "unused" : undefined}>{m.name}</Link>{rank(m.id) === 1 && " (occasional)"}</span>
                            ))}</>}</div></td>
                          <td className="muted">{i.serving}</td>
                          {SHOWN.map((n) => <td key={n.key} className="num">{i.nutrients[n.key] === undefined ? "–" : Math.round(i.nutrients[n.key]! * 10) / 10}</td>)}
                          <td className="num" style={{ whiteSpace: "nowrap" }}>
                            <form className="inline" action={deleteIngredient.bind(null, i.id)}><button className="link danger">delete</button></form>
                          </td>
                        </tr>
                      );
                    }),
                  ])}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </>}
    </>
  );
}
