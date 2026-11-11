import { listIngredients } from "../../lib/queries.ts";
import { NUTRIENTS } from "../../lib/nutrients.ts";
import { setDairy, deleteIngredient, renameIngredient } from "../actions.ts";
import { RenameLabel } from "../rename.tsx";

const SHOWN = NUTRIENTS.filter((n) => ["calories", "protein", "carbs", "fiber", "fat", "sodium"].includes(n.key));

export default async function Ingredients({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? "").trim().toLowerCase();
  const all = listIngredients().filter((i) => i.name.toLowerCase().includes(q));
  return (
    <>
      <h1>Ingredients</h1>
      <p className="lede">Nutrients are for the serving shown. Ask for more on the Review page; they come from USDA FoodData Central.</p>
      <form className="row" role="search" style={{ marginBottom: 14 }}>
        <input name="q" type="search" aria-label="Search ingredients" placeholder="Search ingredients" defaultValue={q} />
        <button>Search</button>
        <span className="muted">{all.length} shown</span>
      </form>
      {all.length === 0 ? <p className="empty">No ingredient matches “{q}”.</p> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Name</th><th>Serving</th>{SHOWN.map((n) => <th key={n.key} className="num">{n.label}</th>)}<th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {all.map((i) => (
                <tr key={i.id} className={i.status}>
                  <td><RenameLabel id={i.id} name={i.name} action={renameIngredient} after={<>
                    {i.status === "proposed" && <span className="badge proposed">proposed</span>}{i.contains_dairy && <span className="badge dairy">dairy</span>}</>} /></td>
                  <td className="muted">{i.serving}</td>
                  {SHOWN.map((n) => <td key={n.key} className="num">{i.nutrients[n.key] === undefined ? "–" : Math.round(i.nutrients[n.key]! * 10) / 10}</td>)}
                  <td className="num" style={{ whiteSpace: "nowrap" }}>
                    <form className="inline" action={setDairy.bind(null, i.id, !i.contains_dairy)}><button className="link">{i.contains_dairy ? "not dairy" : "mark dairy"}</button></form>
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
