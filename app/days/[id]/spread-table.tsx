import { NUTRIENTS, NUTRIENT_GROUPS, type NutrientKey } from "../../../lib/nutrients.ts";
import { daySpread, type NutrientSpread } from "../../../lib/spread.ts";
import type { Slot } from "../../../lib/queries.ts";

const fmt = (v: number) => {
  const a = Math.abs(v);
  return (a >= 100 ? Math.round(v) : a >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100).toLocaleString();
};
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v))}`;
const KEYS = NUTRIENTS.map((n) => n.key);

function Row({ label, unit, s }: { label: string; unit: string; s: NutrientSpread }) {
  const swing = s.mean ? (s.max - s.min) / 2 / s.mean : 0;
  const varies = s.max > s.min;
  const summary = (
    <>
      <span className="sp-name">{label} <span className="muted">{unit}</span></span>
      {varies ? (
        <>
          <span className="sp-num">{fmt(s.min)}</span>
          <span className="sp-num"><b>{fmt(s.mean)}</b></span>
          <span className="sp-num">{fmt(s.max)}</span>
          <span className="sp-why">
            <span className={`sp-swing${swing > 0.1 ? " big" : ""}`}>±{Math.round(swing * 100)}%</span>
            {s.driver && <span className="muted"> {s.driver.part.slotName}: {s.driver.part.label}</span>}
          </span>
        </>
      ) : (
        <>
          <span className="sp-num sp-span3"><b>{fmt(s.mean)}</b> <span className="muted">every day</span></span>
          <span />
        </>
      )}
    </>
  );
  if (!varies) return <div className="sp-row"><div className="sp-line">{summary}</div></div>;
  return (
    <details className="sp-row">
      <summary className="sp-line">{summary}</summary>
      <div className="sp-panel">
        <p className="muted sp-days">
          Lowest day <b>{fmt(s.min)}</b>: {s.low.join(", ")}.<br />
          Highest day <b>{fmt(s.max)}</b>: {s.high.join(", ")}.
        </p>
        <div className="sp-choices">
          {s.byChoice.map((c) => (
            <div key={c.part.key}>
              <div className="muted sp-choice-title">{c.part.slotName}: {c.part.label}</div>
              {c.means.map((m) => <div key={m.name} className="sp-choice"><span>{m.name}</span><span>{fmt(m.mean)} <span className="muted">{signed(m.mean - s.mean)}</span></span></div>)}
            </div>
          ))}
        </div>
      </div>
    </details>
  );
}

// How much each nutrient can vary across the base day's variations, every combination counted equally.
export function SpreadTable({ slots }: { slots: Slot[] }) {
  const { combos, sampled, parts, nutrients } = daySpread(slots, KEYS as NutrientKey[]);
  return (
    <section aria-label="Nutrients">
      <h2 style={{ marginTop: 0 }}>Nutrients</h2>
      <p className="muted sp-lede">
        {parts.length === 0 ? "Your day has no variations, so these are the same every time."
          : `${sampled ? `A fair sample of ${combos.toLocaleString()} of your` : `All ${combos.toLocaleString()}`} possible days from your variations, each counted equally: your lowest day, the average and your highest day. ±% is how far a day can swing from the average, and the choice after it moves the number most. Open a row to see each choice.`}
      </p>
      {NUTRIENT_GROUPS.map((g) => {
        const rows = g.items.filter((n) => nutrients[n.key].max > 0);
        if (!rows.length) return null;
        return (
          <div key={g.name} className="sp-group">
            <div className="sp-line sp-head"><h3>{g.name}</h3><span className="sp-num">Lowest</span><span className="sp-num">Average</span><span className="sp-num">Highest</span><span>Swing · moved most by</span></div>
            {rows.map((n) => <Row key={n.key} label={n.label} unit={n.unit} s={nutrients[n.key]} />)}
          </div>
        );
      })}
    </section>
  );
}
