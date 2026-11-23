// One recipe: GET returns it whole, PUT replaces it (same shape), DELETE removes it.
import { deleteRecipe, getRecipe, parseRecipe, saveRecipe } from "../../../../lib/recipes.ts";

type Context = { params: Promise<{ id: string }> };
const notFound = () => Response.json({ error: "No recipe with that id." }, { status: 404 });

export async function GET(_: Request, { params }: Context) {
  const recipe = getRecipe(Number((await params).id));
  return recipe ? Response.json(recipe) : notFound();
}

export async function PUT(request: Request, { params }: Context) {
  const id = Number((await params).id);
  if (!getRecipe(id)) return notFound();
  const recipe = parseRecipe(await request.json().catch(() => null));
  if ("error" in recipe) return Response.json(recipe, { status: 400 });
  try {
    return Response.json(saveRecipe(recipe, id));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}

export async function DELETE(_: Request, { params }: Context) {
  return deleteRecipe(Number((await params).id)) ? new Response(null, { status: 204 }) : notFound();
}
