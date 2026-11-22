import { getPhoto, removePhoto, setPhoto } from "../../../../../lib/shopping.ts";

type Context = { params: Promise<{ id: string }> };
const notFound = (what = "No item with that id.") => Response.json({ error: what }, { status: 404 });
const itemId = async (params: Context["params"]) => Number((await params).id);

// Clients ask for ?v=<the item's photo token>, so a given URL always means the same image and can be cached for good.
export async function GET(request: Request, { params }: Context) {
  const photo = getPhoto(await itemId(params));
  if (!photo) return notFound("That item has no photo.");
  const cache = new URL(request.url).searchParams.has("v") ? "private, max-age=31536000, immutable" : "no-store";
  return new Response(new Uint8Array(photo.bytes), { headers: { "Content-Type": photo.type, "Cache-Control": cache } });
}

// The body is the image itself (JPEG, PNG, WebP or GIF).
export async function PUT(request: Request, { params }: Context) {
  const result = setPhoto(await itemId(params), new Uint8Array(await request.arrayBuffer()));
  if (!result) return notFound();
  return "error" in result ? Response.json(result, { status: 400 }) : Response.json(result);
}

export async function DELETE(_: Request, { params }: Context) {
  const item = removePhoto(await itemId(params));
  return item ? Response.json(item) : notFound();
}
