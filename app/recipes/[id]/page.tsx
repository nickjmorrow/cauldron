import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "../../../lib/db.ts";
import { getRecipe, listRecipes, type Recipe } from "../../../lib/recipes.ts";
import { BackLink } from "../../ui.tsx";
import { Markdown } from "../markdown.tsx";
import { deleteRecipeAction, saveRecipeForm } from "../../actions.ts";

const BLANK_INGREDIENTS = 3;

function View({ recipe, links, mealIds }: { recipe: Recipe; links: Map<string, number>; mealIds: Map<string, number> }) {
  const groups = [...new Set(recipe.ingredients.map((i) => i.group))];
  const facts = [recipe.serves && `serves ${recipe.serves}`, recipe.activeTime && `${recipe.activeTime} active`, recipe.totalTime && `${recipe.totalTime} total`].filter(Boolean);
  return (
    <>
      {recipe.summary && <div className="lede"><Markdown body={recipe.summary} links={links} /></div>}
      <p className="muted recipe-facts">
        {facts.join(" · ")}
        {recipe.tags.map((t) => <Link key={t} href={`/recipes?tag=${encodeURIComponent(t)}`} className="badge">{t}</Link>)}
      </p>
      {recipe.meals.length > 0 && (
        <p className="muted">In the meal{recipe.meals.length > 1 ? "s" : ""}{" "}
          {recipe.meals.map((m, i) => <span key={m}>{i > 0 && ", "}<Link href={`/meals/${mealIds.get(m)}`}>{m}</Link></span>)}
        </p>
      )}
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

function Edit({ recipe, meals, error }: { recipe: Recipe; meals: string[]; error?: string }) {
  const rows = [...recipe.ingredients, ...Array.from({ length: BLANK_INGREDIENTS }, () => ({ group: "", text: "", buy: "" }))];
  const sections = [...recipe.sections, { title: "", body: "" }];
  return (
    <form action={saveRecipeForm.bind(null, recipe.id)} className="recipe-edit">
      {error && <p className="error" role="alert">{error}</p>}
      <label>Name <input name="name" defaultValue={recipe.name} required /></label>
      <label>Summary <textarea name="summary" defaultValue={recipe.summary} rows={3} /></label>
      <div className="row">
        <label>Serves <input name="serves" defaultValue={recipe.serves} size={8} /></label>
        <label>Active time <input name="activeTime" defaultValue={recipe.activeTime} size={14} /></label>
        <label>Total time <input name="totalTime" defaultValue={recipe.totalTime} size={14} /></label>
        <label>Tags <input name="tags" defaultValue={recipe.tags.join(", ")} placeholder="dinner, sauce" size={28} /></label>
      </div>

      <h2>Ingredients</h2>
      <p className="muted">One line each, as you'd write it. "To buy" is what goes on a shopping list for it; leave it empty for things you never shop for (water). Clear a line to remove it.</p>
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
      <p className="muted">Bullets start with "- "; indent two spaces to nest. **bold**, [text](link) and [[another recipe]] work. Clear a title to remove its section.</p>
      {sections.map((s, n) => (
        <div key={n} className="recipe-edit-section">
          <input name="sectionTitle" aria-label={`Title of section ${n + 1}`} defaultValue={s.title} placeholder={n >= recipe.sections.length ? "New section (instructions, log, notes)" : undefined} />
          <textarea name="sectionBody" aria-label={`Text of section ${n + 1}`} defaultValue={s.body} rows={Math.min(24, Math.max(3, s.body.split("\n").length + 1))} />
        </div>
      ))}

      <h2>Meals</h2>
      <p className="muted">The meals this recipe makes. It counts as typical when one of them is in your typical day.</p>
      <div className="recipe-meals">
        {meals.map((m) => <label key={m} className="row"><input type="checkbox" name="meals" value={m} defaultChecked={recipe.meals.includes(m)} /> {m}</label>)}
      </div>

      <div className="row recipe-edit-bar">
        <button className="primary">Save recipe</button>
        <Link href={`/recipes/${recipe.id}`}>Cancel</Link>
      </div>
    </form>
  );
}

export default async function RecipePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ edit?: string; error?: string }> }) {
  const recipe = getRecipe(Number((await params).id));
  if (!recipe) notFound();
  const query = await searchParams;
  const editing = query.edit === "1";
  const meals = getDb().prepare("SELECT id, name FROM meals ORDER BY name COLLATE NOCASE").all() as { id: number; name: string }[];
  const links = new Map(listRecipes().map((r) => [r.name.toLowerCase(), r.id]));
  return (
    <>
      <BackLink href="/recipes">All recipes</BackLink>
      <div className="row recipe-title">
        <h1>{recipe.name}{recipe.typical && <span className="badge use-day">typical</span>}</h1>
        {!editing && <Link href={`/recipes/${recipe.id}?edit=1`} className="button">Edit</Link>}
      </div>
      {editing
        ? <Edit recipe={recipe} meals={meals.map((m) => m.name)} error={query.error} />
        : <View recipe={recipe} links={links} mealIds={new Map(meals.map((m) => [m.name, m.id]))} />}
      {editing && <form action={deleteRecipeAction.bind(null, recipe.id)} className="recipe-delete"><button className="link danger">Delete this recipe</button></form>}
    </>
  );
}
