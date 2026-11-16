import { getOnlyDay, inUse, listIngredients, occasionalUse } from "../../lib/queries.ts";
import { countByUse, UseFilterToggle } from "../in-use-toggle.tsx";
import { UseTag } from "../flags.tsx";
import { parseUseFilter, useOf } from "../../lib/usage.ts";
import { NUTRIENTS } from "../../lib/nutrients.ts";
import { deleteIngredient, renameIngredient, setIngredientCategory } from "../actions.ts";
import { RenameLabel } from "../rename.tsx";
import { Select } from "../select.tsx";
import { CATEGORIES, groupByCategory } from "../../lib/categories.ts";

const SHOWN = NUTRIENTS.filter((n) => ["calories", "protein", "carbs", "fiber", "fat", "sodium"].includes(n.key));

export default async function Ingredients({ searchParams }: { searchParams: Promise<{ q?: string; show?: string }> }) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().toLowerCase();
  const filter = parseUseFilter(params.show);
  const day = inUse(getOnlyDay()).ingredients;
  const occasional = occasionalUse().ingredients;
  const use = (i: { id: number }) => useOf(i.id, day, occasional);
  const everything = listIngredients();
  const all = everything.filter((i) => (filter === "all" || use(i) === filter) && i.name.toLowerCase().includes(q));
  const href = (f: string) => `/ingredients?${new URLSearchParams({ ...(q ? { q } : {}), ...(f === "day" ? {} : { show: f }) })}`;
  return (
    <>
      <h1>Ingredients</h1>
      <p className="lede">Nutrients are for the serving shown. Ask for more on the Review page; they come from USDA FoodData Central.</p>
      <form className="row" role="search" style={{ marginBottom: 14 }}>
        <UseFilterToggle current={filter} counts={countByUse(everything, use)} href={href} />
        {filter !== "day" && <input type="hidden" name="show" value={filter} />}
        <input name="q" type="search" aria-label="Search ingredients" placeholder="Search ingredients" defaultValue={q} />
        <button>Search</button>
        <span className="muted">{all.length} shown</span>
      </form>
      {all.length === 0 ? <p className="empty">{q ? <>No ingredient matches “{q}”.</> : "Nothing here yet."}</p> : <>
        <form action={setIngredientCategory} className="add" style={{ borderTop: 0, paddingTop: 0 }}>
          <Select name="ingredient" required placeholder="Choose an ingredient…" options={all.map((i) => ({ value: String(i.id), label: i.name, hint: i.category || undefined }))} />
          <span className="muted">goes under</span>
          <Select name="category" required placeholder="Choose a category…" options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
          <button className="primary">Move it</button>
        </form>
        {groupByCategory(all).map((g) => (
          <section key={g.category}>
            <h2>{g.category} ({g.items.length})</h2>
            <div className="table-wrap">
              <table className="aligned">
                <thead><tr><th>Name</th><th>Serving</th>{SHOWN.map((n) => <th key={n.key} className="num">{n.label}</th>)}<th><span className="sr-only">Actions</span></th></tr></thead>
                <tbody>
                  {g.items.map((i) => (
                    <tr key={i.id} className={i.status}>
                      <td><RenameLabel id={i.id} name={i.name} action={renameIngredient} after={<>
                        {i.status === "proposed" && <span className="badge proposed">proposed</span>}
                        {filter === "all" && <UseTag use={use(i)} />}</>} /></td>
                      <td className="muted">{i.serving}</td>
                      {SHOWN.map((n) => <td key={n.key} className="num">{i.nutrients[n.key] === undefined ? "–" : Math.round(i.nutrients[n.key]! * 10) / 10}</td>)}
                      <td className="num" style={{ whiteSpace: "nowrap" }}>
                        <form className="inline" action={deleteIngredient.bind(null, i.id)}><button className="link danger">delete</button></form>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}
      </>}
    </>
  );
}
