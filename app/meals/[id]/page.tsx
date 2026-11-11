import { notFound } from "next/navigation";
import { getMeal, listIngredients } from "../../../lib/queries.ts";
import { NUTRIENT_GROUPS } from "../../../lib/nutrients.ts";
import { BackLink } from "../../ui.tsx";
import { RenameTitle } from "../../rename.tsx";
import { Select } from "../../select.tsx";
import { renameMeal, setMealItem, removeMealItem, approve, deleteMeal } from "../../actions.ts";

export default async function MealPage({ params }: { params: Promise<{ id: string }> }) {
  const meal = getMeal(Number((await params).id));
  if (!meal) notFound();
  const approved = listIngredients("approved");
  return (
    <>
      <BackLink href="/meals">All meals</BackLink>
      <h1><RenameTitle id={meal.id} name={meal.name} action={renameMeal} />{meal.status === "proposed" && <span className="badge proposed">proposed</span>}</h1>
      <p className="lede">{[meal.typical_slot, meal.source, meal.notes].filter(Boolean).join(" · ")}</p>
      {meal.status === "proposed" && <form action={approve.bind(null, "meal", meal.id)}><button className="primary">Approve meal</button></form>}

      <div className="split" style={{ marginTop: 24 }}>
        <section>
          <h2 style={{ marginTop: 0 }}>Ingredients</h2>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Ingredient</th><th className="num">Servings</th><th><span className="sr-only">Remove</span></th></tr></thead>
              <tbody>
                {meal.items.map((i) => (
                  <tr key={i.ingredient.id}>
                    <td>{i.ingredient.name}{i.ingredient.status === "proposed" && <span className="badge proposed">not approved, not counted</span>}
                      <div className="muted">per {i.ingredient.serving}</div></td>
                    <td className="num">
                      <form className="inline" action={setMealItem}>
                        <input type="hidden" name="meal" value={meal.id} /><input type="hidden" name="ingredient" value={i.ingredient.id} />
                        <input name="qty" type="number" step="any" min="0" aria-label={`Servings of ${i.ingredient.name}`} defaultValue={i.qty} style={{ width: 84 }} /><button className="link">save</button>
                      </form>
                    </td>
                    <td className="num"><form action={removeMealItem.bind(null, meal.id, i.ingredient.id)}><button className="link danger">remove</button></form></td>
                  </tr>
                ))}
                {meal.items.length === 0 && <tr><td colSpan={3} className="empty">No ingredients yet. Add one below.</td></tr>}
              </tbody>
            </table>
          </div>
          <form action={setMealItem} className="add">
            <input type="hidden" name="meal" value={meal.id} />
            <Select name="ingredient" required placeholder="Choose an ingredient…"
              options={approved.map((i) => ({ value: String(i.id), label: i.name, hint: i.serving }))} />
            <input name="qty" type="number" step="any" min="0" required aria-label="Servings" placeholder="Servings" style={{ width: 100 }} />
            <button className="primary">Add ingredient</button>
          </form>
          <form action={deleteMeal.bind(null, meal.id)}><button className="link danger">Delete this meal (only works if no day uses it)</button></form>
        </section>

        <section>
          <h2 style={{ marginTop: 0 }}>Nutrients</h2>
          <div className="table-wrap">
            <table>
              <tbody>
                {NUTRIENT_GROUPS.map((g) => [
                  <tr key={g.name} className="group"><th colSpan={2}>{g.name}</th></tr>,
                  ...g.items.map((n) => (
                    <tr key={n.key}><td>{n.label}</td>
                      <td className="num">{meal.totals[n.key] === undefined ? "–" : `${Math.round(meal.totals[n.key]! * 10) / 10} ${n.unit}`}</td></tr>
                  )),
                ])}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
