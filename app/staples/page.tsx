import { listStaples } from "../../lib/queries.ts";
import { STAPLE_KINDS, type StapleKind } from "../../lib/categories.ts";
import { addStaple, deleteStaple } from "../actions.ts";
import { Select } from "../select.tsx";

export default async function Staples() {
  const staples = listStaples();
  const kinds = Object.entries(STAPLE_KINDS) as [StapleKind, string][];
  return (
    <>
      <h1>Staples</h1>
      <p className="lede">Spices and baking basics worth keeping on hand. They aren't part of any meal, so they don't count toward the day's nutrients.</p>
      {kinds.map(([kind, label]) => {
        const items = staples.filter((s) => s.kind === kind);
        return (
          <section key={kind}>
            <h2>{label} ({items.length})</h2>
            {items.length === 0 ? <p className="muted">None yet.</p> : (
              <ul className="plain-chips">
                {items.map((s) => (
                  <li key={s.id} className="chip">
                    {s.name}
                    <form className="inline" action={deleteStaple.bind(null, s.id)}>
                      <button className="link danger" aria-label={`Remove ${s.name}`}>×</button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <form action={addStaple} className="add">
        <input name="name" aria-label="Staple name" placeholder="Sumac" required />
        <span className="muted">goes under</span>
        <Select name="kind" required placeholder="Choose a list…" defaultValue="spice" options={kinds.map(([value, label]) => ({ value, label }))} />
        <button className="primary">Add</button>
      </form>
    </>
  );
}
