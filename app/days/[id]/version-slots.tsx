import { Select, type Option } from "../../select.tsx";
import type { Slot, Version } from "../../../lib/queries.ts";
import type { VersionKey } from "../../../lib/versions.ts";
import { ghostSlots, type Block } from "../../../lib/ghost.ts";
import { addFoodToVersion, planInVersion, removeAddedFood, removeFromVersion, resetVersionToBase, restoreToVersion, scaleInVersion, setAddedFoodQty } from "../../actions.ts";
import { BlockCell, EDITOR } from "./blocks.tsx";

const PORTIONS = [[0.5, "½ portion"], [0.75, "¾ portion"], [1, "full portion"], [1.25, "1¼ portions"], [1.5, "1½ portions"]] as const;

// Names the version a form acts on; the version is created the first time something changes.
const Which = ({ want }: { want: VersionKey }) => (
  <>
    <input type="hidden" name="goal" value={want.goal} />
    <input type="hidden" name="kind" value={want.kind} />
  </>
);

const round = (n: number | undefined) => Math.round(n ?? 0);
const signed = (n: number) => `${n >= 0 ? "+" : "−"}${Math.abs(n)}`;

// Portion and drop for a meal that comes from the base day.
function BaseControls({ block, want }: { block: Block; want: VersionKey }) {
  const optionId = block.option.optionId;
  return (
    <>
      <form action={scaleInVersion} className="inline">
        <Which want={want} /><input type="hidden" name="option" value={optionId} />
        <select key={block.factor} name="factor" defaultValue={block.factor} aria-label={`Portion of ${block.option.meal.name}`}>
          {PORTIONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
        </select>
        <button className="link">set</button>
      </form>
      <form action={removeFromVersion}><Which want={want} /><input type="hidden" name="option" value={optionId} /><button className="link danger">drop</button></form>
    </>
  );
}

// An added food: how much, or take it out again.
function AddedControls({ block, want }: { block: Block; want: VersionKey }) {
  const adjust = block.option.adjust?.kind === "add" ? block.option.adjust : undefined;
  if (!adjust) return null;
  const serving = adjust.ingredientId ? block.option.meal.items[0]?.ingredient.serving : undefined;
  return (
    <>
      <form action={setAddedFoodQty} className="inline">
        <Which want={want} /><input type="hidden" name="adjustment" value={adjust.adjustmentId} />
        <input name="qty" type="number" step="0.25" min="0.25" max="20" defaultValue={adjust.qty} aria-label={`Amount of ${block.option.meal.name}`} className="qty" required />
        {serving && <span className="muted">× {serving}</span>}
        <button className="link">set</button>
      </form>
      <form action={removeAddedFood}><Which want={want} /><input type="hidden" name="adjustment" value={adjust.adjustmentId} /><button className="link danger">remove</button></form>
    </>
  );
}

// The block is the summary, so clicking it opens its controls: no script needed.
function Editable({ block, want, children }: { block: Block; want: VersionKey; children: React.ReactNode }) {
  return (
    <details className="gh-d">
      <summary aria-label={`${block.option.meal.name}: show controls`}><BlockCell block={block} scale={EDITOR} /></summary>
      <div className="gh-controls">{children}</div>
    </details>
  );
}

// What this version eats, drawn over the base day: drop a meal, change its portion, or add a food.
export function VersionSlots({ base, resolved, adjustments, want, foodOptions }: {
  base: Slot[];
  resolved: Slot[];
  adjustments: Version["adjustments"];
  want: VersionKey;
  foodOptions: Option[];
}) {
  return (
    <aside aria-label="Slots">
      <h2 style={{ marginTop: 0 }}>Slots</h2>
      <p className="muted gh-key"><span className="gh-ghostkey" />the base day's portion · click a block to change it</p>
      <div className="items">
        {ghostSlots(base, resolved).map((slot) => (
          <div key={slot.id} className="item">
            <div className="row"><b className="slot-name">{slot.name}</b></div>
            {slot.parts.map((p, index) => {
              const live = p.options.filter((b) => b.status !== "dropped");
              const main = live.find((b) => b.planned) ?? live[0];
              const alternates = live.filter((b) => b !== main);
              const dropped = p.options.filter((b) => b.status === "dropped");
              return (
                <div key={p.part} className="part">
                  {index > 0 && <div className="with" aria-hidden="true">with</div>}
                  {main && <Editable block={main} want={want}><BaseControls block={main} want={want} /></Editable>}
                  {alternates.length > 0 && (
                    <div className="gh-alts">
                      <div className="muted gh-alts-title">Other versions of this meal</div>
                      {alternates.map((b) => (
                        <div key={b.option.optionId} className="gh-alt">
                          <form action={planInVersion}>
                            <Which want={want} /><input type="hidden" name="option" value={b.option.optionId} />
                            <button className="gh-alt-pick" title="Make this the planned meal">
                              <span>{b.option.meal.name}</span>
                              <span>{main ? `${signed(b.kcal - main.kcal)} kcal · ${signed(round(b.option.meal.totals.protein) - round(main.option.meal.totals.protein))} g protein` : `${b.kcal} kcal`}</span>
                            </button>
                          </form>
                          <details className="gh-more"><summary aria-label={`More for ${b.option.meal.name}`}>⋯</summary><div className="gh-controls"><BaseControls block={b} want={want} /></div></details>
                        </div>
                      ))}
                    </div>
                  )}
                  {dropped.map((b) => (
                    <div key={b.option.optionId} className="gh-dropped">
                      <BlockCell block={b} scale={EDITOR} />
                      <form action={restoreToVersion}><Which want={want} /><input type="hidden" name="option" value={b.option.optionId} /><button className="link">restore</button></form>
                    </div>
                  ))}
                </div>
              );
            })}
            {slot.added.map((b) => <Editable key={b.option.optionId} block={b} want={want}><AddedControls block={b} want={want} /></Editable>)}
            <details className="gh-add">
              <summary>+ add a food</summary>
              <form action={addFoodToVersion} className="pick">
                <Which want={want} /><input type="hidden" name="slot" value={slot.id} />
                <Select name="food" required placeholder="Add a food…" options={foodOptions} />
                <input name="qty" type="number" step="0.25" min="0.25" max="20" defaultValue={1} aria-label="Amount" className="qty" required />
                <button>Add</button>
              </form>
            </details>
          </div>
        ))}
      </div>
      {adjustments.length > 0 && (
        <details className="variation">
          <summary>reset this version to the base day</summary>
          <form action={resetVersionToBase}>
            <Which want={want} />
            <p className="muted">Undoes every drop, portion change and added food in this version.</p>
            <button className="danger-solid">Reset to base day</button>
          </form>
        </details>
      )}
    </aside>
  );
}
