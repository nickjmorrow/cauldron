import { attachProductPhoto, productPhotosEnabled } from "../../../../../../lib/product-photos.ts";
import { getItem } from "../../../../../../lib/shopping.ts";

const refuse = (error: string, status: number) => Response.json({ error }, { status });

// Searches the web for the item's product and makes its picture the item's photo, replacing any it had. Can take a minute.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const item = getItem(Number((await params).id));
  if (!item) return refuse("No item with that id.", 404);
  if (!productPhotosEnabled()) return refuse("Product photos are off on the server, or it has no `claude` command.", 503);
  const found = await attachProductPhoto(item.id, item.name, { onlyBranded: false });
  return found ? Response.json(found) : refuse(`Couldn't find a product photo for "${item.name}".`, 404);
}
