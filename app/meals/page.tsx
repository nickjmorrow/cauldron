import Link from "next/link";
import { getOnlyDay, inUse, listMeals } from "../../lib/queries.ts";
import { InUseToggle, isShowAll } from "../in-use-toggle.tsx";
import { createMeal } from "../actions.ts";

export default async function Meals({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const showAll = isShowAll((await searchParams).show);
  const used = inUse(getOnlyDay()).meals;
  const everything = listMeals();
  const meals = showAll ? everything : everything.filter((m) => used.has(m.id));
  return (
    <>
      <h1>Meals</h1>
      <p className="lede">A meal is a list of ingredients with quantities. Days pick from these.</p>
      <div className="row" style={{ marginBottom: 14 }}>
        <InUseToggle showAll={showAll} used={everything.filter((m) => used.has(m.id)).length} total={everything.length} href={(all) => (all ? "/meals?show=all" : "/meals")} />
      </div>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Meal</th><th>Usually</th><th className="num">kcal</th><th className="num">Protein g</th><th className="num">Carbs g</th><th className="num">Fat g</th></tr></thead>
          <tbody>
            {meals.map((m) => (
              <tr key={m.id} className={m.status}>
                <td><Link href={`/meals/${m.id}`}>{m.name}</Link>
                  {m.status === "proposed" && <span className="badge proposed">proposed</span>}</td>
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
        <button className="primary">Add meal</button>
      </form>
    </>
  );
}
