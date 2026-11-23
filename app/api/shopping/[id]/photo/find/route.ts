import { attachProductPhoto, krogerEnabled } from "../../../../../../lib/kroger.ts";
import { getItem } from "../../../../../../lib/shopping.ts";

const refuse = (error: string, status: number) => Response.json({ error }, { status });

// Finds the item's product in the store's catalog and makes its picture the item's photo, replacing any it had.
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const item = getItem(Number((await params).id));
  if (!item) return refuse("No item with that id.", 404);
  if (!krogerEnabled()) return refuse("Product photos aren't set up on the server (see KROGER_CLIENT_ID in the README).", 503);
  const found = await attachProductPhoto(item.id, item.name, { onlyBranded: false });
  return found ? Response.json(found) : refuse(`Couldn't find a product photo for "${item.name}".`, 404);
}
