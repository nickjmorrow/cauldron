import Link from "next/link";
import { getOnlyDay, inUse, listMeals, occasionalUse } from "../../lib/queries.ts";
import { countByUse, UseFilterToggle } from "../in-use-toggle.tsx";
import { UseTag } from "../flags.tsx";
import { parseUseFilter, useOf } from "../../lib/usage.ts";
import { createMeal } from "../actions.ts";

export default async function Meals({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const filter = parseUseFilter((await searchParams).show);
  const day = inUse(getOnlyDay()).meals;
  const occasional = occasionalUse().meals;
  const use = (m: { id: number }) => useOf(m.id, day, occasional);
  const everything = listMeals();
  const meals = filter === "all" ? everything : everything.filter((m) => use(m) === filter);
  return (
    <>
      <h1>Meals</h1>
      <p className="lede">A meal is a list of ingredients with quantities. The typical day picks from these; mark the ones you cook now and then (cookies, a stew) as occasional on the meal's page.</p>
      <div className="row" style={{ marginBottom: 14 }}>
        <UseFilterToggle current={filter} counts={countByUse(everything, use)} href={(f) => (f === "day" ? "/meals" : `/meals?show=${f}`)} />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Meal</th><th>Usually</th><th className="num">kcal</th><th className="num">Protein g</th><th className="num">Carbs g</th><th className="num">Fat g</th></tr></thead>
          <tbody>
            {meals.map((m) => (
              <tr key={m.id} className={m.status}>
                <td><Link href={`/meals/${m.id}`}>{m.name}</Link>
                  {m.status === "proposed" && <span className="badge proposed">proposed</span>}
                  {filter === "all" && <UseTag use={use(m)} />}</td>
                <td className="muted">{m.typical_slot}</td>
                {(["calories", "protein", "carbs", "fat"] as const).map((k) => <td key={k} className="num">{Math.round(m.totals[k] ?? 0)}</td>)}
              </tr>
            ))}
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
