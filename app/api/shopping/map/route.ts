// The store map: what each numbered aisle holds. POST starts a research run (then places items whose aisle is a guess).
import { lookupsEnabled, rebuildStoreMap, storeMapBuilding } from "../../../../lib/aisles.ts";
import { getStoreMap, storeMapUpdated } from "../../../../lib/store-map.ts";

export async function GET() {
  return Response.json({ aisles: getStoreMap(), updated: storeMapUpdated(), building: storeMapBuilding() });
}

export async function POST() {
  if (!lookupsEnabled()) return Response.json({ error: "Store research needs the claude command, signed in, on the server." }, { status: 503 });
  return Response.json({ started: rebuildStoreMap() }, { status: 202 });
}
