import Link from "next/link";
import { averageTotals, getOnlyDay, getProfile } from "../../lib/queries.ts";
import { healthCeilings } from "../../lib/guardrails.ts";
import { NUTRIENTS, NUTRIENT_GROUPS, type Nutrients } from "../../lib/nutrients.ts";
import { contributions, listSupplements, STATUSES, supplementTotals, TIMES, type Supplement } from "../../lib/supplements.ts";
import { deleteSupplement, saveSupplementForm } from "../actions.ts";

const fmt = (v: number) => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100).toLocaleString();
const unitOf = Object.fromEntries(NUTRIENTS.map((n) => [n.key, n])) as Record<string, (typeof NUTRIENTS)[number]>;
const adds = (nutrients: Nutrients) => Object.entries(nutrients).map(([key, v]) => `${fmt(v as number)} ${unitOf[key].unit} ${unitOf[key].label.toLowerCase()}`).join(", ");
// A supplement adds vitamins, minerals and fats; nobody takes a pill for calories.
const ADDABLE = NUTRIENT_GROUPS.filter((g) => g.name !== "Energy and macros");

function Rows({ list, byTime }: { list: Supplement[]; byTime: boolean }) {
  return (
    <div className="table-wrap">
      <table className="aligned">
        <thead><tr><th>Name</th><th>Amount</th><th>{byTime ? "Note" : "When"}</th><th>Adds to the day</th><th><span className="sr-only">Actions</span></th></tr></thead>
        <tbody>
          {(byTime ? TIMES.filter((t) => list.some((s) => s.time === t.value)) : [null]).map((time) => [
            time && <tr key={time.value} className="group"><th colSpan={5}>{time.label}</th></tr>,
            ...list.filter((s) => !time || s.time === time.value).map((s) => (
              <tr key={s.id}>
                <td>{s.name}{s.product && <div className="used-in">{s.product}</div>}</td>
                <td>{s.amount || <span className="muted">–</span>}</td>
                <td className="muted">{[byTime ? "" : TIMES.find((t) => t.value === s.time)!.label, s.note].filter(Boolean).join(" · ")}</td>
                <td className="muted">{adds(s.nutrients) || "nothing counted"}</td>
                <td className="num"><Link href={`/supplements?edit=${s.id}#edit`}>edit</Link></td>
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  );
}

export default async function Supplements({ searchParams }: { searchParams: Promise<{ edit?: string; error?: string }> }) {
  const { edit, error } = await searchParams;
  const all = listSupplements();
  const editing = all.find((s) => s.id === Number(edit));
  const taking = all.filter((s) => s.status === "taking");
  const rows = contributions(averageTotals(getOnlyDay().slots), supplementTotals(all), healthCeilings(getProfile()?.weightKg));
  const over = rows.filter((r) => r.over);

  return (
    <>
      <h1>Supplements</h1>
      <p className="lede">What you take on a schedule rather than eat in a meal: how much, and when. The ones you're taking add their nutrients to every day, so the Day page, the upper limits and suggested fixes all count them.</p>
      {error && <p className="notice-line error" role="alert">{error}</p>}
      {all.length === 0 && <p className="empty">Nothing here yet. Add the first one below.</p>}

      {taking.length > 0 && <section aria-label="Taking"><h2>Taking ({taking.length})</h2><Rows list={taking} byTime /></section>}

      {rows.length > 0 && (
        <section aria-label="With your food">
          <h2>With your food</h2>
          <p className="lede">Each nutrient your supplements add, on top of what a typical base day's food already gives. The upper limits are published adult limits, not medical advice.</p>
          {over.length > 0 && <p className="notice-line error" role="alert">Over the upper limit: {over.map((r) => unitOf[r.key].label.toLowerCase()).join(", ")}.</p>}
          <div className="table-wrap">
            <table className="aligned">
              <thead><tr><th>Nutrient</th><th className="num">Food</th><th className="num">Supplements</th><th className="num">Together</th><th className="num">Upper limit</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key}>
                    <td>{unitOf[r.key].label} <span className="muted">{unitOf[r.key].unit}</span></td>
                    <td className="num">{fmt(r.food)}</td>
                    <td className="num">{fmt(r.supplements)}</td>
                    <td className={`num${r.over ? " bad" : ""}`}><b>{fmt(r.total)}</b></td>
                    <td className="num muted">{r.ceiling === undefined ? "none" : fmt(r.ceiling)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {STATUSES.filter((s) => s.value !== "taking").map((status) => {
        const list = all.filter((s) => s.status === status.value);
        return list.length > 0 && <section key={status.value} aria-label={status.label}><h2>{status.label} ({list.length})</h2><Rows list={list} byTime={false} /></section>;
      })}

      <section aria-label={editing ? "Edit" : "Add"} id="edit">
        <h2>{editing ? `Edit ${editing.name}` : "Add a supplement"}</h2>
        {/* The key empties the form when switching between adding and editing. */}
        <form key={editing?.id ?? "new"} action={saveSupplementForm.bind(null, editing?.id ?? null)} className="profile-form">
          <label>Name<input name="name" required maxLength={120} defaultValue={editing?.name} placeholder="Vitamin D" /></label>
          <label>Product<input name="product" maxLength={300} defaultValue={editing?.product} placeholder="Brand, 1,000 IU softgel" /></label>
          <label>Amount<input name="amount" maxLength={300} defaultValue={editing?.amount} placeholder="1 softgel" /></label>
          <label>When
            <select name="time" defaultValue={editing?.time ?? "morning"}>{TIMES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
          </label>
          <label>Note<input name="note" maxLength={300} defaultValue={editing?.note} placeholder="with breakfast" /></label>
          <label>Status
            <select name="status" defaultValue={editing?.status ?? "taking"}>{STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}</select>
          </label>
          <details className="supp-nutrients" open={!!editing && Object.keys(editing.nutrients).length > 0}>
            <summary>What the amount adds to a day</summary>
            {ADDABLE.map((g) => (
              <fieldset key={g.name}>
                <legend>{g.name}</legend>
                {g.items.map((n) => <label key={n.key}>{n.label} ({n.unit})<input name={`n:${n.key}`} type="number" step="any" min="0" defaultValue={editing?.nutrients[n.key]} /></label>)}
              </fieldset>
            ))}
          </details>
          <div className="row">
            <button className="primary">{editing ? "Save" : "Add"}</button>
            {editing && <Link href="/supplements">Cancel</Link>}
            {editing && <button className="link danger" formAction={deleteSupplement.bind(null, editing.id)} formNoValidate>delete</button>}
          </div>
        </form>
      </section>
    </>
  );
}
