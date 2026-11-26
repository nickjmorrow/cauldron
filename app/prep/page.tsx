import Link from "next/link";
import { getDb } from "../../lib/db.ts";
import { cadenceLabel, listPrep, type Prep } from "../../lib/prep.ts";
import { removePrepAction, savePrepForm } from "../actions.ts";
import { Select } from "../select.tsx";

const round = (v: number) => (Math.round(v * 10) / 10).toLocaleString();
const days = (n: number) => `${round(n)} ${n === 1 ? "day" : "days"}`;

// What doesn't fit about a cadence, and what the numbers would give instead.
function Check({ prep }: { prep: Prep }) {
  if (prep.suggestedDays === null) return <span className="muted">not in the day</span>;
  if (prep.runsOut) return <span className="bad">runs out after {days(prep.lastsDays!)}: {cadenceLabel(prep.suggestedDays).toLowerCase()} fits</span>;
  const notes = [
    prep.suggestedDays === prep.everyDays ? "fits" : `the numbers give ${cadenceLabel(prep.suggestedDays).toLowerCase()}`,
    prep.outlastsKeeping && `keeps ${days(prep.keepsDays)}: freeze the rest or make less`,
  ].filter(Boolean);
  return <span className="muted">{notes.join(" · ")}</span>;
}

export default async function PrepPage({ searchParams }: { searchParams: Promise<{ edit?: string; error?: string }> }) {
  const { edit, error } = await searchParams;
  const all = listPrep();
  const editing = all.find((p) => p.mealId === Number(edit));
  const cadences = [...new Set(all.map((p) => p.everyDays))];
  const withPrep = new Set(all.map((p) => p.mealId));
  const meals = (getDb().prepare("SELECT id, name FROM meals ORDER BY name COLLATE NOCASE").all() as { id: number; name: string }[]).filter((m) => !withPrep.has(m.id));

  return (
    <>
      <h1>Prep</h1>
      <p className="lede">What you make ahead to keep the typical day going, by how often. How much gets eaten is read from the base day, counting every swap of a slot as eaten equally often, plus what other meals take from a batch (a sandwich made from the roast). A cadence is yours to set; the last column says when a batch would run out first, or outlast how long it keeps.</p>
      {error && <p className="notice-line error" role="alert">{error}</p>}
      {all.length === 0 && <p className="empty">Nothing here yet. Add the first one below.</p>}

      {all.length > 0 && (
        <div className="table-wrap">
          <table className="aligned">
            <thead><tr><th>Make</th><th className="num">A batch makes</th><th className="num">Eaten a week</th><th className="num">Batch lasts</th><th className="num">Keeps</th><th>Does it fit</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {cadences.map((every) => [
                <tr key={every} className="group"><th colSpan={7}>{cadenceLabel(every)}</th></tr>,
                ...all.filter((p) => p.everyDays === every).map((p) => (
                  <tr key={p.mealId}>
                    <td><Link href={`/meals/${p.mealId}`}>{p.name}</Link><div className="used-in">{p.task}</div></td>
                    <td className="num">{round(p.makes)}</td>
                    <td className="num">{round(p.perWeek)}</td>
                    <td className="num">{p.lastsDays === null ? <span className="muted">–</span> : days(p.lastsDays)}</td>
                    <td className="num">{p.keepsDays ? days(p.keepsDays) : <span className="muted">–</span>}</td>
                    <td><Check prep={p} /></td>
                    <td className="num"><Link href={`/prep?edit=${p.mealId}#edit`}>edit</Link></td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      )}

      <section aria-label={editing ? "Edit" : "Add"} id="edit">
        <h2>{editing ? `Edit prep for ${editing.name}` : "Add prep for a meal"}</h2>
        {/* The key empties the form when switching between adding and editing. */}
        <form key={editing?.mealId ?? "new"} action={savePrepForm} className="profile-form">
          {editing
            ? <input type="hidden" name="meal" value={editing.mealId} />
            : <label>Meal<Select name="meal" required placeholder="Choose a meal…" options={meals.map((m) => ({ value: String(m.id), label: m.name }))} /></label>}
          <label>What to make<input name="task" required maxLength={300} defaultValue={editing?.task} placeholder="Roast a tray" /></label>
          <label>A batch makes (servings)<input name="makes" type="number" step="any" min="0.1" required defaultValue={editing?.makes} /></label>
          <label>Keeps (days, empty if not known)<input name="keepsDays" type="number" step="1" min="0" defaultValue={editing?.keepsDays || ""} /></label>
          <label>Make it every (days, empty to use what the numbers give)<input name="everyDays" type="number" step="1" min="1" defaultValue={editing?.everyDays} /></label>
          <div className="row">
            <button className="primary">{editing ? "Save" : "Add"}</button>
            {editing && <Link href="/prep">Cancel</Link>}
            {editing && <button className="link danger" formAction={removePrepAction.bind(null, editing.mealId)} formNoValidate>remove</button>}
          </div>
        </form>
      </section>
    </>
  );
}
