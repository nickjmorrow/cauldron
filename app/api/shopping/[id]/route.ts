import { parseChange, removeItem, updateItem } from "../../../../lib/shopping.ts";

type Context = { params: Promise<{ id: string }> };
const notFound = () => Response.json({ error: "No item with that id." }, { status: 404 });

export async function PATCH(request: Request, { params }: Context) {
  const change = parseChange(await request.json().catch(() => null), { needsName: false });
  if ("error" in change) return Response.json(change, { status: 400 });
  const item = updateItem(Number((await params).id), change);
  return item ? Response.json(item) : notFound();
}

export async function DELETE(_: Request, { params }: Context) {
  return removeItem(Number((await params).id)) ? new Response(null, { status: 204 }) : notFound();
}
