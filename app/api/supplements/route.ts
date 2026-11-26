// JSON API for supplements, for other clients (a phone app, an assistant). No authentication: see the README on running behind a VPN.
// GET returns every supplement and what the ones being taken add to a day; POST adds one.
import { listSupplements, parseSupplement, saveSupplement, supplementTotals } from "../../../lib/supplements.ts";

export async function GET() {
  const supplements = listSupplements();
  return Response.json({ supplements, totals: supplementTotals(supplements) });
}

export async function POST(request: Request) {
  const supplement = parseSupplement(await request.json().catch(() => null));
  if ("error" in supplement) return Response.json(supplement, { status: 400 });
  try {
    return Response.json(saveSupplement(supplement), { status: 201 });
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 409 });
  }
}
