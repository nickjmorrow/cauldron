// JSON API for recipes. GET lists them; POST saves a whole recipe (replacing the one of the same name, if any).
import { listRecipes, parseRecipe, saveRecipe } from "../../../lib/recipes.ts";

export async function GET() {
  return Response.json({ recipes: listRecipes() });
}

export async function POST(request: Request) {
  const recipe = parseRecipe(await request.json().catch(() => null));
  if ("error" in recipe) return Response.json(recipe, { status: 400 });
  return Response.json(saveRecipe(recipe), { status: 201 });
}
