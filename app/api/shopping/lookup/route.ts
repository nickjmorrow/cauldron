// Starts store aisle lookups for every open item whose aisle is only a guessed section. Answers with how many started.
import { lookUpGuessed, lookupsEnabled } from "../../../../lib/aisles.ts";

export async function POST() {
  if (!lookupsEnabled()) return Response.json({ error: "Aisle lookups need ANTHROPIC_API_KEY on the server." }, { status: 503 });
  return Response.json({ started: lookUpGuessed() });
}
