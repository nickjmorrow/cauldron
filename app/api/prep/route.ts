// JSON API for prep, for other clients (a phone app, an assistant). No authentication: see the README on running behind a VPN.
// GET returns every meal's prep, most frequent first, with how much of it is eaten a week and whether the cadence fits.
import { listPrep } from "../../../lib/prep.ts";

export async function GET() {
  return Response.json({ prep: listPrep() });
}
