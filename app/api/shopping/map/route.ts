// The store map: the items known to be in each numbered aisle.
import { getStoreMap } from "../../../../lib/store-map.ts";

export async function GET() {
  return Response.json({ aisles: getStoreMap() });
}
