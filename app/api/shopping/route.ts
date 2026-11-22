// JSON API for the shopping list, used by the phone and watch apps. No authentication: see the README on running behind a VPN.
import { addItem, groupItems, listItems, parseChange } from "../../../lib/shopping.ts";

export async function GET() {
  return Response.json(groupItems(listItems()));
}

export async function POST(request: Request) {
  const change = parseChange(await request.json().catch(() => null), { needsName: true });
  if ("error" in change) return Response.json(change, { status: 400 });
  return Response.json(addItem({ ...change, name: change.name! }), { status: 201 });
}
