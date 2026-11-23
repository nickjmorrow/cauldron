import Link from "next/link";
import { listRecipes } from "../../lib/recipes.ts";
import { createRecipe } from "../actions.ts";

export default async function Recipes({ searchParams }: { searchParams: Promise<{ tag?: string; show?: string; error?: string }> }) {
  const params = await searchParams;
  const everything = listRecipes();
  const tags = [...new Set(everything.flatMap((r) => r.tags))].sort((a, b) => a.localeCompare(b));
  const typicalOnly = params.show === "typical";
  const recipes = everything.filter((r) => (!params.tag || r.tags.includes(params.tag)) && (!typicalOnly || r.typical));
  const href = (tag: string | undefined, typical: boolean) => {
    const query = new URLSearchParams();
    if (tag) query.set("tag", tag);
    if (typical) query.set("show", "typical");
    return query.size ? `/recipes?${query}` : "/recipes";
  };
  return (
    <>
      <h1>Recipes</h1>
      <p className="lede">What you cook: ingredients, steps and notes. A recipe belongs to the meals it makes; the ones behind your typical day are what a shopping item is for when you add it without a reason.</p>
      {params.error && <p className="error" role="alert">{params.error}</p>}
      <form action={createRecipe} className="row" style={{ marginBottom: 14 }}>
        <input name="name" aria-label="New recipe name" placeholder="New recipe (lemon vinaigrette)" required />
        <button className="primary">Add recipe</button>
      </form>
      <div className="recipe-filters">
        <Link href={href(params.tag, !typicalOnly)} className="shop-reason" aria-pressed={typicalOnly} replace>Typical only</Link>
        <Link href={href(undefined, typicalOnly)} className="shop-reason" aria-pressed={!params.tag} replace>All tags</Link>
        {tags.map((t) => <Link key={t} href={href(t, typicalOnly)} className="shop-reason" aria-pressed={params.tag === t} replace>{t}</Link>)}
      </div>
      {recipes.length === 0 && <p className="empty">{everything.length === 0 ? "No recipes yet." : "No recipes match."}</p>}
      {recipes.length > 0 && (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Recipe</th><th>Tags</th><th>Meals</th></tr></thead>
            <tbody>
              {recipes.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/recipes/${r.id}`}>{r.name}</Link>{r.typical && <span className="badge use-day">typical</span>}</td>
                  <td className="muted">{r.tags.join(", ")}</td>
                  <td className="muted">{r.meals.join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
