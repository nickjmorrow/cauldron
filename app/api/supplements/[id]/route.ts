// One supplement: GET returns it, PUT replaces it (the same shape as POST /api/supplements), DELETE removes it.
import { getSupplement, parseSupplement, removeSupplement, saveSupplement } from "../../../../lib/supplements.ts";

type Context = { params: Promise<{ id: string }> };
const notFound = () => Response.json({ error: "No supplement with that id." }, { status: 404 });

export async function GET(_: Request, { params }: Context) {
  const supplement = getSupplement(Number((await params).id));
  return supplement ? Response.json(supplement) : notFound();
}

export async function PUT(request: Request, { params }: Context) {
  const id = Number((await params).id);
  if (!getSupplement(id)) return notFound();
  const supplement = parseSupplement(await request.json().catch(() => null));
  if ("error" in supplement) return Response.json(supplement, { status: 400 });
  try {
    return Response.json(saveSupplement(supplement, id));
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}

export async function DELETE(_: Request, { params }: Context) {
  const id = Number((await params).id);
  if (!getSupplement(id)) return notFound();
  removeSupplement(id);
  return new Response(null, { status: 204 });
}
