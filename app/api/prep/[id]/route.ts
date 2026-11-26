// One meal's prep, by the meal's id: PUT sets it ({task, makes, keepsDays, everyDays}), DELETE removes it.
import { parsePrep, removePrep, savePrep } from "../../../../lib/prep.ts";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  const prep = parsePrep(await request.json().catch(() => null));
  if ("error" in prep) return Response.json(prep, { status: 400 });
  try {
    savePrep(Number((await params).id), prep);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 404 });
  }
  return Response.json(prep);
}

export async function DELETE(_: Request, { params }: Context) {
  removePrep(Number((await params).id));
  return new Response(null, { status: 204 });
}
