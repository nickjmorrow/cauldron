import Link from "next/link";
import { listMeals } from "../../lib/queries.ts";
import { createMeal } from "../actions.ts";

export default function Meals() {
  const meals = listMeals();
  return (
    <>
      <h1>Meals</h1>
      <p className="lede">A meal is a list of ingredients with quantities. Days pick from these.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Meal</th><th>Usually</th><th className="num">kcal</th><th className="num">Protein g</th><th className="num">Carbs g</th><th className="num">Fat g</th></tr></thead>
          <tbody>
            {meals.map((m) => (
              <tr key={m.id} className={m.status}>
                <td><Link href={`/meals/${m.id}`}>{m.name}</Link>
                  {m.status === "proposed" && <span className="badge proposed">proposed</span>}
                  {m.items.some((i) => i.ingredient.contains_dairy) && <span className="badge dairy">dairy</span>}</td>
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
