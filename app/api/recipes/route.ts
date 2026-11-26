// JSON API for recipes: how meals are cooked. GET lists the meals that have one; POST saves a whole recipe onto the
// meal of that name (replacing the recipe it had), or adds a new occasional meal for it.
import { listRecipes, parseRecipe, saveRecipe } from "../../../lib/recipes.ts";

export async function GET() {
  return Response.json({ recipes: listRecipes() });
}

export async function POST(request: Request) {
  const recipe = parseRecipe(await request.json().catch(() => null));
  if ("error" in recipe) return Response.json(recipe, { status: 400 });
  return Response.json(saveRecipe(recipe), { status: 201 });
}
