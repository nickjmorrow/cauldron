import { NUTRIENTS, NUTRIENT_GROUPS, type NutrientKey } from "../../../lib/nutrients.ts";
import { daySpread, type NutrientSpread } from "../../../lib/spread.ts";
import type { Slot } from "../../../lib/queries.ts";

const fmt = (v: number) => {
  const a = Math.abs(v);
  return (a >= 100 ? Math.round(v) : a >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100).toLocaleString();
};
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v))}`;
const KEYS = NUTRIENTS.map((n) => n.key);

// Where a value sits between the lowest and highest possible day, as a percentage.
const at = (v: number, s: NutrientSpread) => (s.max === s.min ? 50 : ((v - s.min) / (s.max - s.min)) * 100);

// One faint dot per combination, merged where they coincide so the strip darkens where days pile up.
function Strip({ s }: { s: NutrientSpread }) {
  const piles = new Map<number, number>();
  for (const v of s.values) {
    const pos = Math.round(at(v, s) * 2) / 2;
    piles.set(pos, (piles.get(pos) ?? 0) + 1);
  }
  const ofAll = 1 / s.values.length;
  return (
    <div className="sp-strip" aria-hidden="true">
      <div className="sp-track" />
      {[...piles].map(([pos, n]) => <span key={pos} className="sp-dot" style={{ left: `${pos}%`, opacity: Math.min(0.85, 0.12 + n * ofAll * 8) }} />)}
      <span className="sp-tick" style={{ left: `${at(s.mean, s)}%` }} />
    </div>
  );
}

function Histogram({ s }: { s: NutrientSpread }) {
  const tallest = Math.max(...s.bins);
  return (
    <div className="sp-hist" aria-hidden="true">
      <div className="sp-bars">{s.bins.map((n, i) => <i key={i} style={{ height: `${(n / tallest) * 100}%` }} title={`${n} of ${s.values.length} combinations`} />)}</div>
      <span className="sp-tick" style={{ left: `${at(s.mean, s)}%` }} />
      <div className="sp-ends"><span>{fmt(s.min)}</span><span>{fmt(s.max)}</span></div>
    </div>
  );
}

function Row({ label, unit, s, named }: { label: string; unit: string; s: NutrientSpread; named: boolean }) {
  const swing = s.mean ? (s.max - s.min) / 2 / s.mean : 0;
  const varies = s.max > s.min;
  return (
    <details className="sp-row">
      <summary>
        <span className="sp-name">{label} <span className="muted">{unit}</span></span>
        {varies ? <Strip s={s} /> : <span className="muted sp-same">same every time</span>}
        <span className="sp-stat">
          <b>{fmt(s.mean)}</b>{varies && <span className="muted"> avg · {fmt(s.min)}–{fmt(s.max)}</span>}
          {varies && <span className={`sp-swing${swing > 0.1 ? " big" : ""}`}>±{Math.round(swing * 100)}%</span>}
          {s.driver && <span className="muted sp-driver">mostly {named && `${s.driver.part.slotName}: `}{s.driver.part.label} ({Math.round(s.driver.share * 100)}%)</span>}
        </span>
      </summary>
      {varies && (
        <div className="sp-panel">
          <Histogram s={s} />
          <p className="muted sp-days">
            Lowest day <b>{fmt(s.min)}</b>: {s.low.join(", ")}.<br />
            Highest day <b>{fmt(s.max)}</b>: {s.high.join(", ")}.
          </p>
          <div className="sp-choices">
            {s.byChoice.map((c) => (
              <div key={c.part.key}>
                <div className="muted sp-choice-title">{named && `${c.part.slotName}: `}{c.part.label}</div>
                {c.means.map((m) => <div key={m.name} className="sp-choice"><span>{m.name}</span><span>{fmt(m.mean)} <span className="muted">{signed(m.mean - s.mean)}</span></span></div>)}
              </div>
            ))}
          </div>
        </div>
      )}
    </details>
  );
}

// How much each nutrient can vary across the base day's variations, every combination counted equally.
export function SpreadTable({ slots }: { slots: Slot[] }) {
  const { combos, sampled, parts, nutrients } = daySpread(slots, KEYS as NutrientKey[]);
  const named = new Set(parts.map((p) => p.slotName)).size > 1; // say which slot only when several vary
  return (
    <section aria-label="Nutrients">
      <h2 style={{ marginTop: 0 }}>Nutrients</h2>
      <p className="muted sp-lede">
        {parts.length === 0 ? "Your day has no variations, so these are the same every time."
          : `${sampled ? `A fair sample of ${combos.toLocaleString()} of your` : `All ${combos.toLocaleString()}`} possible days, each counted equally. The strip runs from your lowest to your highest day; the tick is the average. Open a row for its shape.`}
      </p>
      {NUTRIENT_GROUPS.map((g) => {
        const rows = g.items.filter((n) => nutrients[n.key].max > 0);
        if (!rows.length) return null;
        return (
          <div key={g.name} className="sp-group">
            <h3>{g.name}</h3>
            {rows.map((n) => <Row key={n.key} label={n.label} unit={n.unit} s={nutrients[n.key]} named={named} />)}
          </div>
        );
      })}
    </section>
  );
}
