import { Select, type Option } from "../../select.tsx";
import { STUB_SERVING, type Slot, type Version } from "../../../lib/queries.ts";
import type { VersionKey } from "../../../lib/versions.ts";
import { ghostSlots, type Block } from "../../../lib/ghost.ts";
import { addFoodToVersion, planInVersion, removeAddedFood, removeFromVersion, resetVersionToBase, restoreToVersion, scaleInVersion, setAddedFoodQty } from "../../actions.ts";
import { BlockCell, EDITOR } from "./blocks.tsx";
import { MealDialog } from "./meal-dialog.tsx";

const PORTIONS = [[0.5, "½ portion"], [0.75, "¾ portion"], [1, "full portion"], [1.25, "1¼ portions"], [1.5, "1½ portions"]] as const;

// Names the version a form acts on; the version is created the first time something changes.
const Which = ({ want }: { want: VersionKey }) => (
  <>
    <input type="hidden" name="goal" value={want.goal} />
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
        <label>Portion in this version{" "}
          <select key={block.factor} name="factor" defaultValue={block.factor}>
            {PORTIONS.map(([value, text]) => <option key={value} value={value}>{text}</option>)}
          </select>
        </label>
        <button>Set portion</button>
      </form>
      <form action={removeFromVersion}><Which want={want} /><input type="hidden" name="option" value={optionId} /><button className="link danger">Drop from this version</button></form>
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
        <label>Amount{" "}
          <input name="qty" type="number" step="0.25" min="0.25" max="20" defaultValue={adjust.qty} className="qty" required />
        </label>
        {serving && <span className="muted">× {serving}</span>}
        <button>Set amount</button>
      </form>
      <form action={removeAddedFood}><Which want={want} /><input type="hidden" name="adjustment" value={adjust.adjustmentId} /><button className="link danger">Remove from this version</button></form>
    </>
  );
}

const one = (n: number) => Math.round(n * 10) / 10;
// "100 g" servings read best as grams; anything else as a count of servings.
function amountText(servings: number, serving: string) {
  const grams = serving.match(/^(\d+(?:\.\d+)?) g$/);
  if (grams) return `${Math.round(servings * Number(grams[1]))} g`;
  return `${Math.round(servings * 100) / 100} × ${serving}`;
}
const portionText = (factor: number) => PORTIONS.find(([v]) => v === factor)?.[1] ?? `×${factor}`;

// What goes into a meal at this version's portion: each ingredient's amount, calories and macros, then the total.
// The resolved meal's totals are already at this portion; its items are the recipe's, except an added food, whose one item already has the amount.
function MealContents({ block }: { block: Block }) {
  const { meal, adjust } = block.option;
  const by = adjust?.kind === "add" ? (adjust.ingredientId !== null ? 1 : adjust.qty) : block.factor;
  const items = meal.items.filter((i) => i.ingredient.serving !== STUB_SERVING);
  const macros = (n: { calories?: number; protein?: number; carbs?: number; fat?: number }, times: number) => (
    <><td className="num">{round((n.calories ?? 0) * times)}</td><td className="num">{one((n.protein ?? 0) * times)}</td><td className="num">{one((n.carbs ?? 0) * times)}</td><td className="num">{one((n.fat ?? 0) * times)}</td></>
  );
  return (
    <div className="table-wrap meal-contents">
      <table>
        <thead><tr><th>Ingredient</th><th className="num">Amount</th><th className="num">kcal</th><th className="num">Protein g</th><th className="num">Carbs g</th><th className="num">Fat g</th></tr></thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan={6} className="muted">No ingredient breakdown: this meal is counted as a whole.</td></tr>}
          {items.map(({ ingredient, qty }) => (
            <tr key={ingredient.id}>
              <td>{ingredient.name}</td>
              <td className="num">{amountText(qty * by, ingredient.serving)}</td>
              {macros(ingredient.nutrients, qty * by)}
            </tr>
          ))}
        </tbody>
        <tfoot><tr><th>Total</th><td />{macros(meal.totals, 1)}</tr></tfoot>
      </table>
    </div>
  );
}

// Clicking a meal opens a dialog: what is in it at this portion, then the controls.
function Editable({ block, slotName, want, children }: { block: Block; slotName: string; want: VersionKey; children: React.ReactNode }) {
  const added = block.status === "added";
  return (
    <MealDialog label={`${block.option.meal.name}: see ingredients and portion`} trigger={<BlockCell block={block} scale={EDITOR} />}
      title={block.option.meal.name} subtitle={`${slotName} · ${added ? "added in this version" : portionText(block.factor)} · ${block.kcal} kcal`}>
      <MealContents block={block} />
      <div className="meal-controls">{children}</div>
    </MealDialog>
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
      <p className="muted gh-key"><span className="gh-ghostkey" />the base day's portion · click a meal to see its ingredients and change its portion</p>
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
                  {main && <Editable block={main} slotName={slot.name} want={want}><BaseControls block={main} want={want} /></Editable>}
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
                          <MealDialog label={`${b.option.meal.name}: see ingredients and portion`} trigger={<span className="gh-more-dots" aria-hidden="true">⋯</span>}
                            title={b.option.meal.name} subtitle={`${slot.name} · another version of this meal · ${portionText(b.factor)} · ${b.kcal} kcal`}>
                            <MealContents block={b} />
                            <div className="meal-controls"><BaseControls block={b} want={want} /></div>
                          </MealDialog>
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
            {slot.added.map((b) => <Editable key={b.option.optionId} block={b} slotName={slot.name} want={want}><AddedControls block={b} want={want} /></Editable>)}
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
