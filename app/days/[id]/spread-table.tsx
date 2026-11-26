import Link from "next/link";
import { NUTRIENTS, NUTRIENT_GROUPS, type NutrientKey, type Nutrients } from "../../../lib/nutrients.ts";
import { daySpread, standout, type NutrientSpread } from "../../../lib/spread.ts";
import { judge, type Target } from "../../../lib/compute.ts";
import type { Slot } from "../../../lib/queries.ts";

const fmt = (v: number) => {
  const a = Math.abs(v);
  return (a >= 100 ? Math.round(v) : a >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100).toLocaleString();
};
const signed = (v: number) => `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v))}`;
const KEYS = NUTRIENTS.map((n) => n.key);
// A swing this large (as a share of the typical amount) means the variations differ a lot for this nutrient.
const BIG_SWING = 0.25;

function Row({ label, unit, s, target }: { label: string; unit: string; s: NutrientSpread; target?: Target }) {
  const half = (s.max - s.min) / 2;
  const swing = s.mean ? half / s.mean : 0;
  const varies = s.max > s.min;
  const aim = target?.daily ?? null;
  const verdict = aim ? judge(s.mean, aim, target!.type) : null;
  const big = swing > BIG_SWING;
  const culprit = big ? standout(s) : undefined;
  const summary = (
    <>
      <span className="sp-name">{label} <span className="muted">{unit}</span></span>
      <span className="sp-num"><b>{fmt(s.mean)}</b>{varies && <span className={`sp-pm${big ? " big" : ""}`}> ± {fmt(half)}</span>}</span>
      {target !== undefined && <span className="sp-num muted">{aim === null ? "–" : `${target.type === "at_least" ? "≥ " : target.type === "no_more_than" ? "≤ " : ""}${fmt(aim)}`}</span>}
      {target !== undefined && <span className={`sp-num ${verdict?.verdict ?? ""}`}>{verdict ? `${Math.round(verdict.pct * 100)}%` : ""}</span>}
      <span className="sp-why">{culprit ? <><b>{culprit.name}</b> <span className="muted">{signed(culprit.delta)} {unit} vs the other {culprit.slotName.toLowerCase()} choices</span></> : ""}</span>
    </>
  );
  if (!varies) return <div className="sp-row"><div className={`sp-line${target !== undefined ? " with-target" : ""}`}>{summary}</div></div>;
  return (
    <details className="sp-row">
      <summary className={`sp-line${target !== undefined ? " with-target" : ""}`}>{summary}</summary>
      <div className="sp-panel">
        <div className="sp-choices">
          {s.byChoice.map((c) => (
            <div key={c.part.key}>
              <div className="muted sp-choice-title">{c.part.slotName}: a typical day with each</div>
              {c.means.map((m) => <div key={m.name} className="sp-choice"><span>{m.name}</span><span>{fmt(m.mean)} <span className="muted">{signed(m.mean - s.mean)}</span></span></div>)}
            </div>
          ))}
        </div>
        <p className="muted sp-days">Lowest possible day <b>{fmt(s.min)}</b>, highest <b>{fmt(s.max)}</b>.</p>
      </div>
    </details>
  );
}

// What a typical day adds up to when every variation is eaten equally often, and how far a day can swing from it.
// With targets, each typical amount is compared with its target. Supplements being taken are counted in every day.
export function SpreadTable({ slots, targets, supplements = {} }: { slots: Slot[]; targets?: Record<string, Target>; supplements?: Nutrients }) {
  const { parts, nutrients } = daySpread(slots, KEYS as NutrientKey[], undefined, supplements);
  const withTarget = targets !== undefined;
  return (
    <section aria-label="Nutrients">
      <h2 style={{ marginTop: 0 }}>Nutrients</h2>
      <p className="muted sp-lede">
        {parts.length === 0 ? "Your day has no variations, so these are the same every day."
          : "A typical day, with every variation eaten equally often. ± is how far a day can swing either way. When it's highlighted, the variation causing it is named. Open a row to see each variation's effect."}
        {Object.keys(supplements).length > 0 && <> Your <Link href="/supplements">supplements</Link> are counted.</>}
      </p>
      {NUTRIENT_GROUPS.map((g) => {
        const rows = g.items.filter((n) => nutrients[n.key].max > 0 || targets?.[n.key]?.daily);
        if (!rows.length) return null;
        return (
          <div key={g.name} className="sp-group">
            <div className={`sp-line sp-head${withTarget ? " with-target" : ""}`}>
              <h3>{g.name}</h3><span className="sp-num">Typical day</span>
              {withTarget && <><span className="sp-num">Target</span><span className="sp-num">of target</span></>}
              <span />
            </div>
            {rows.map((n) => <Row key={n.key} label={n.label} unit={n.unit} s={nutrients[n.key]} target={withTarget ? (targets[n.key] ?? { daily: null, type: null }) : undefined} />)}
          </div>
        );
      })}
    </section>
  );
}
