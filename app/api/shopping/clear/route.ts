import { clearDone } from "../../../../lib/shopping.ts";

// Hides every checked-off item, for the end of a trip.
export async function POST() {
  clearDone();
  return new Response(null, { status: 204 });
}
