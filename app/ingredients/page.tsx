import { getOnlyDay, inUse, listIngredients } from "../../lib/queries.ts";
import { InUseToggle, isShowAll } from "../in-use-toggle.tsx";
import { NUTRIENTS } from "../../lib/nutrients.ts";
import { deleteIngredient, renameIngredient } from "../actions.ts";
import { RenameLabel } from "../rename.tsx";

const SHOWN = NUTRIENTS.filter((n) => ["calories", "protein", "carbs", "fiber", "fat", "sodium"].includes(n.key));

export default async function Ingredients({ searchParams }: { searchParams: Promise<{ q?: string; show?: string }> }) {
  const params = await searchParams;
  const q = (params.q ?? "").trim().toLowerCase();
  const showAll = isShowAll(params.show);
  const used = inUse(getOnlyDay()).ingredients;
  const everything = listIngredients();
  const all = everything.filter((i) => (showAll || used.has(i.id)) && i.name.toLowerCase().includes(q));
  const href = (all: boolean) => `/ingredients?${new URLSearchParams({ ...(q ? { q } : {}), ...(all ? { show: "all" } : {}) })}`;
  return (
    <>
      <h1>Ingredients</h1>
      <p className="lede">Nutrients are for the serving shown. Ask for more on the Review page; they come from USDA FoodData Central.</p>
      <form className="row" role="search" style={{ marginBottom: 14 }}>
        <InUseToggle showAll={showAll} used={everything.filter((i) => used.has(i.id)).length} total={everything.length} href={href} />
        {showAll && <input type="hidden" name="show" value="all" />}
        <input name="q" type="search" aria-label="Search ingredients" placeholder="Search ingredients" defaultValue={q} />
        <button>Search</button>
        <span className="muted">{all.length} shown</span>
      </form>
      {all.length === 0 ? <p className="empty">{q ? <>No ingredient matches “{q}”.</> : "None in use yet."}</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Serving</th>{SHOWN.map((n) => <th key={n.key} className="num">{n.label}</th>)}<th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {all.map((i) => (
                <tr key={i.id} className={i.status}>
                  <td><RenameLabel id={i.id} name={i.name} action={renameIngredient} after={<>
                    {i.status === "proposed" && <span className="badge proposed">proposed</span>}</>} /></td>
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
      )}
    </>
  );
}
