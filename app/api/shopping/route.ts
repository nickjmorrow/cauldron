// JSON API for the shopping list, used by the phone and watch apps. No authentication: see the README on running behind a VPN.
import { addAndLookUp } from "../../../lib/aisles.ts";
import { groupItems, listItems, parseChange } from "../../../lib/shopping.ts";

export async function GET() {
  return Response.json(groupItems(listItems()));
}

export async function POST(request: Request) {
  const change = parseChange(await request.json().catch(() => null), { needsName: true });
  if ("error" in change) return Response.json(change, { status: 400 });
  return Response.json(addAndLookUp({ ...change, name: change.name! }), { status: 201 });
}
