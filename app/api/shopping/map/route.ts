// The store map: what each numbered aisle holds and the items known to be in it.
// PUT {"aisle": "4", "holds": "Pasta, condiments"} sets what an aisle holds; empty holds forgets it.
import { cleanAisle } from "../../../../lib/shopping.ts";
import { getStoreMap, MAX_HOLDS, setAisleContents } from "../../../../lib/store-map.ts";

export async function GET() {
  return Response.json({ aisles: getStoreMap() });
}

export async function PUT(request: Request) {
  const body = (await request.json().catch(() => null)) as { aisle?: unknown; holds?: unknown } | null;
  if (typeof body?.aisle !== "string" || typeof body.holds !== "string") return Response.json({ error: "Send aisle and holds as text." }, { status: 400 });
  const aisle = cleanAisle(body.aisle.trim());
  if (!/^\d{1,3}$/.test(aisle)) return Response.json({ error: "aisle must be an aisle number." }, { status: 400 });
  const holds = body.holds.trim();
  if (holds.length > MAX_HOLDS) return Response.json({ error: `holds is longer than ${MAX_HOLDS} characters.` }, { status: 400 });
  setAisleContents(aisle, holds);
  return Response.json({ aisles: getStoreMap() });
}
