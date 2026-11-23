// The reasons switched off for this trip. PUT {"hidden": ["Later", ""]} sets them ("" = items with no reason).
import { parseHidden, setHidden, shoppingList } from "../../../../lib/shopping.ts";

export async function PUT(request: Request) {
  const hidden = parseHidden(await request.json().catch(() => null));
  if ("error" in hidden) return Response.json(hidden, { status: 400 });
  setHidden(hidden);
  return Response.json(shoppingList());
}
