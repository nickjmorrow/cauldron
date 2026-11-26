import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "../../../lib/db.ts";
import { getRecipe, isBlank, type Recipe } from "../../../lib/recipes.ts";
import { getMeal, listIngredients } from "../../../lib/queries.ts";
import { NUTRIENT_GROUPS } from "../../../lib/nutrients.ts";
import { BackLink } from "../../ui.tsx";
import { RenameTitle } from "../../rename.tsx";
import { Select } from "../../select.tsx";
import { renameMeal, setMealItem, removeMealItem, approve, deleteMeal, setMealOccasional, saveRecipeForm } from "../../actions.ts";
import { Markdown } from "../markdown.tsx";

const BLANK_INGREDIENTS = 3;
type Links = Map<string, number>;

// How the meal is cooked: the ingredient lines as written, then each section.
function RecipeView({ recipe, links }: { recipe: Recipe; links: Links }) {
  const groups = [...new Set(recipe.ingredients.map((i) => i.group))];
  return (
    <>
      {recipe.ingredients.length > 0 && (
        <section className="recipe-section">
          <h2>Ingredients</h2>
          {groups.map((g) => (
            <div key={g}>
              {g && <h3>{g}</h3>}
              <ul className="recipe-ingredients">
                {recipe.ingredients.filter((i) => i.group === g).map((i, n) => <li key={n}><Markdown body={`- ${i.text}`} links={links} /></li>)}
              </ul>
            </div>
          ))}
        </section>
      )}
      {recipe.sections.filter((s) => s.body).map((s) => (
        <section key={s.title} className="recipe-section">
          <h2>{s.title}</h2>
          <Markdown body={s.body} links={links} />
        </section>
      ))}
    </>
  );
}

function RecipeEdit({ recipe, error }: { recipe: Recipe; error?: string }) {
  const rows = [...recipe.ingredients, ...Array.from({ length: BLANK_INGREDIENTS }, () => ({ group: "", text: "", buy: "" }))];
  const sections = [...recipe.sections, { title: "", body: "" }];
  return (
    <form action={saveRecipeForm.bind(null, recipe.id)} className="recipe-edit">
      {error && <p className="error" role="alert">{error}</p>}
      <label>Summary <textarea name="summary" defaultValue={recipe.summary} rows={3} /></label>
      <div className="row">
        <label>Serves <input name="serves" defaultValue={recipe.serves} size={8} /></label>
        <label>Active time <input name="activeTime" defaultValue={recipe.activeTime} size={14} /></label>
        <label>Total time <input name="totalTime" defaultValue={recipe.totalTime} size={14} /></label>
        <label>Tags <input name="tags" defaultValue={recipe.tags.join(", ")} placeholder="dinner, sauce" size={28} /></label>
      </div>

      <h2>Ingredients</h2>
      <p className="muted">One line each, as you'd write it. "To buy" is what goes on a shopping list for it; leave it empty for things you never shop for (water), and split several names with ";". Clear a line to remove it. These lines are for cooking and shopping; nutrition comes from the counted ingredients on the meal's page.</p>
      <div className="table-wrap">
        <table>
          <thead><tr><th>Ingredient</th><th>To buy</th><th>Sub-list</th></tr></thead>
          <tbody>
            {rows.map((i, n) => (
              <tr key={n}>
                <td><input name="ingredientText" aria-label={`Ingredient ${n + 1}`} defaultValue={i.text} placeholder={n >= recipe.ingredients.length ? "2 Tbsp olive oil" : undefined} /></td>
                <td><input name="ingredientBuy" aria-label={`What to buy for ingredient ${n + 1}`} defaultValue={i.buy} placeholder={n >= recipe.ingredients.length ? "olive oil" : undefined} /></td>
                <td><input name="ingredientGroup" aria-label={`Sub-list of ingredient ${n + 1}`} defaultValue={i.group} size={12} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Sections</h2>
      <p className="muted">Bullets start with "- "; indent two spaces to nest. **bold**, [text](link) and [[another meal]] work. Clear a title to remove its section.</p>
      {sections.map((s, n) => (
        <div key={n} className="recipe-edit-section">
          <input name="sectionTitle" aria-label={`Title of section ${n + 1}`} defaultValue={s.title} placeholder={n >= recipe.sections.length ? "New section (instructions, log, notes)" : undefined} />
          <textarea name="sectionBody" aria-label={`Text of section ${n + 1}`} defaultValue={s.body} rows={Math.min(24, Math.max(3, s.body.split("\n").length + 1))} />
        </div>
      ))}

      <div className="row recipe-edit-bar">
        <button className="primary">Save recipe</button>
        <Link href={`/meals/${recipe.id}`}>Cancel</Link>
      </div>
    </form>
  );
}

export default async function MealPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; error?: string }> }) {
  const meal = getMeal(Number((await params).id));
  if (!meal) notFound();
  const query = await searchParams;
  const editing = query.edit === "1";
  const approved = listIngredients("approved");
  const recipe = getRecipe(meal.id)!;
  const hasRecipe = !isBlank(recipe);
  const links: Links = new Map((getDb().prepare("SELECT id, name FROM meals").all() as { id: number; name: string }[]).map((m) => [m.name.toLowerCase(), m.id]));
  const facts = [recipe.serves && `serves ${recipe.serves}`, recipe.activeTime && `${recipe.activeTime} active`, recipe.totalTime && `${recipe.totalTime} total`].filter(Boolean);
  if (editing) {
    return (
      <>
        <BackLink href={`/meals/${meal.id}`}>{meal.name}</BackLink>
        <h1>How {meal.name} is cooked</h1>
        <RecipeEdit recipe={recipe} error={query.error} />
      </>
    );
  }
  return (
    <>
      <BackLink href="/meals">All meals</BackLink>
      <div className="row recipe-title">
        <h1><RenameTitle id={meal.id} name={meal.name} action={renameMeal} />{meal.status === "proposed" && <span className="badge proposed">proposed</span>}</h1>
        <Link href={`/meals/${meal.id}?edit=1`} className="button">{hasRecipe ? "Edit recipe" : "Add a recipe"}</Link>
      </div>
      <p className="lede">{[meal.typical_slot, meal.source, meal.notes].filter(Boolean).join(" · ")}</p>
      {recipe.summary && <div className="lede"><Markdown body={recipe.summary} links={links} /></div>}
      {(facts.length > 0 || recipe.tags.length > 0) && (
        <p className="muted recipe-facts">
          {facts.join(" · ")}
          {recipe.tags.map((t) => <span key={t} className="badge">{t}</span>)}
        </p>
      )}
      {meal.status === "proposed" && <form action={approve.bind(null, "meal", meal.id)}><button className="primary">Approve meal</button></form>}
      <form action={setMealOccasional.bind(null, meal.id, !meal.occasional)} className="row">
        {meal.occasional ? <span className="badge use-occasional" style={{ marginLeft: 0 }}>occasional</span> : null}
        <button className="link">{meal.occasional ? "Not an occasional meal" : "Mark as an occasional meal (cooked now and then, not in the typical day)"}</button>
      </form>

      <RecipeView recipe={recipe} links={links} />

      <div className="split" style={{ marginTop: 24 }}>
        <section>
          <h2 style={{ marginTop: 0 }}>{hasRecipe ? "Counted ingredients" : "Ingredients"}</h2>
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
