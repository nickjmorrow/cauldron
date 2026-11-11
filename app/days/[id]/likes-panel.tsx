import { Select, type Option } from "../../select.tsx";
import { GenerateForm } from "../../ui.tsx";
import type { Slot } from "../../../lib/queries.ts";
import type { Like } from "../../../lib/likes.ts";
import { generateLikes, likeFoodAction, proposeAllVersions, unlikeFoodAction } from "../../actions.ts";

// Under the base day: say what you eat, keep the foods you like for each meal, and ask for all six versions to be improved from them.
export function LikesPanel({ slots, likes, foodOptions }: { slots: Slot[]; likes: Like[]; foodOptions: Option[] }) {
  return (
    <section aria-label="Foods you like" className="likes-panel">
      <h2>Foods you like</h2>
      <p className="lede">Suggested fixes add from these, along with what your base meals already use, and never any dairy. Say what you eat and I'll match it to foods you have; they wait on the Review page until you approve them.</p>
      <GenerateForm action={generateLikes} label="Learn my foods" placeholder="Eggs and toast for breakfast, rice bowls with chicken for lunch…" />
      <div className="items">
        {slots.map((slot) => {
          const mine = likes.filter((l) => l.slotName === slot.name);
          return (
            <div key={slot.id} className="item">
              <div className="row"><b className="slot-name">{slot.name}</b></div>
              <div className="like-chips">
                {mine.length === 0 && <span className="muted">Nothing yet.</span>}
                {mine.map((l) => (
                  <span key={l.ingredientId} className={`like-chip${l.status === "proposed" ? " proposed" : ""}`} title={l.status === "proposed" ? "Waiting for your approval on the Review page" : undefined}>
                    {l.name}
                    {l.status === "approved" && (
                      <form action={unlikeFoodAction.bind(null, l.ingredientId, slot.name)} className="inline"><button className="icon" aria-label={`Stop liking ${l.name} for ${slot.name}`}>×</button></form>
                    )}
                  </span>
                ))}
              </div>
              <form action={likeFoodAction} className="pick">
                <input type="hidden" name="slot" value={slot.name} />
                <Select name="ingredient" required placeholder="Add a food you like…" options={foodOptions} />
                <button>Add</button>
              </form>
            </div>
          );
        })}
      </div>
      <form action={proposeAllVersions} className="add">
        <button className="primary">Improve all six versions</button>
        <span className="muted">Suggests changes for each version from the base day and these foods; nothing changes until you accept.</span>
      </form>
    </section>
  );
}
