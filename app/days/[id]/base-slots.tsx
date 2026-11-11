import { RenameLabel } from "../../rename.tsx";
import { Select, type Option } from "../../select.tsx";
import type { Slot } from "../../../lib/queries.ts";
import { addOption, addSlot, moveSlot, removeOption, removeSlot, renameSlot, setPlanned } from "../../actions.ts";

const Chevron = ({ up }: { up?: boolean }) => (
  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" style={up ? { transform: "rotate(180deg)" } : undefined}>
    <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// Edit the base day: the slots and meals every version starts from. Meals in one part are variations; separate parts are eaten together.
export function BaseSlots({ slots, mealOptions }: { slots: Slot[]; mealOptions: Option[] }) {
  return (
    <aside aria-label="Base day slots">
      <h2 style={{ marginTop: 0 }}>Base day</h2>
      <div className="items">
        {slots.map((s, slotIndex) => {
          const together = s.parts.length > 1;
          const variations = s.parts.some((p) => p.options.length > 1);
          return (
            <div key={s.id} className="item">
              <div className="row">
                <b className="slot-name"><RenameLabel id={s.id} name={s.name} action={renameSlot}
                  after={<span className="muted slot-meta">{[together && `${s.parts.length} eaten together`, variations && "has variations"].filter(Boolean).join(" · ") || "same every time"}</span>} /></b>
                <span className="grow" />
                <form action={moveSlot.bind(null, s.id, -1)}><button className="icon" aria-label={`Move ${s.name} earlier`} disabled={slotIndex === 0}><Chevron up /></button></form>
                <form action={moveSlot.bind(null, s.id, 1)}><button className="icon" aria-label={`Move ${s.name} later`} disabled={slotIndex === slots.length - 1}><Chevron /></button></form>
                <form action={removeSlot.bind(null, s.id)}><button className="link danger">remove slot</button></form>
              </div>
              {s.parts.map((p, index) => (
                <div key={p.part} className="part">
                  {index > 0 && <div className="with" aria-hidden="true">with</div>}
                  {p.options.map((o) => (
                    <div key={o.optionId} className="option">
                      <span className={`planned-dot${o.isPlanned ? "" : " off"}`} title={o.isPlanned ? "Planned" : undefined} />
                      <span className="grow">
                        {o.meal.name}{o.meal.status === "proposed" && <span className="badge proposed">proposed</span>}
                        {o.meal.items.some((i) => i.ingredient.contains_dairy) && <span className="badge dairy">dairy</span>}
                        <span className="muted block">{Math.round(o.meal.totals.calories ?? 0)} kcal · {Math.round(o.meal.totals.protein ?? 0)} g protein</span>
                      </span>
                      <span className="acts">
                        {!o.isPlanned && p.options.length > 1 && <form action={setPlanned.bind(null, o.optionId)}><button className="link">make planned</button></form>}
                        <form action={removeOption.bind(null, o.optionId)}><button className="link danger">remove</button></form>
                      </span>
                    </div>
                  ))}
                  <details className="variation">
                    <summary>add a variation</summary>
                    <form action={addOption} className="pick">
                      <input type="hidden" name="slot" value={s.id} /><input type="hidden" name="part" value={p.part} />
                      <Select name="meal" required placeholder="Instead of this, I might have…" options={mealOptions} />
                      <button>Add</button>
                    </form>
                  </details>
                </div>
              ))}
              <form action={addOption} className="pick">
                <input type="hidden" name="slot" value={s.id} /><input type="hidden" name="part" value="new" />
                <Select name="meal" required placeholder={s.parts.length ? "Add something eaten with this…" : "Choose a meal…"} options={mealOptions} />
                <button>{s.parts.length ? "Add" : "Set"}</button>
              </form>
            </div>
          );
        })}
      </div>
      <form action={addSlot} className="add">
        <input name="name" aria-label="Slot name" placeholder="New slot (Lunch 2)" required />
        <button className="primary">Add slot</button>
      </form>
    </aside>
  );
}
