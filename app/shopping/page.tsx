import Link from "next/link";
import { getDb } from "../../lib/db.ts";
import { getStoreMap } from "../../lib/store-map.ts";
import { isShown, NO_REASON, shoppingList, type ShoppingItem } from "../../lib/shopping.ts";
import { PhotoForm } from "./photo-form.tsx";
import { RefreshWhile } from "./refresh-while.tsx";
import { ShopRow } from "./shop-row.tsx";
import { addShoppingItem, clearShoppingDone, removeShoppingItem, setShoppingAisle, setShoppingMeals, toggleShoppingReason } from "../actions.ts";

type MealLinks = Map<string, number>; // lower-cased meal name -> meal id, for linking "for" names to Cauldron meals

function MealTags({ meals, links }: { meals: string[]; links: MealLinks }) {
  if (meals.length === 0) return null;
  return (
    <span className="shop-meals" aria-label={`For ${meals.join(", ")}`}>
      {meals.map((m, i) => {
        const id = links.get(m.toLowerCase());
        return (
          <span key={m}>
            {i > 0 && ", "}
            {id ? <Link href={`/meals/${id}`}>{m}</Link> : <span className="shop-meal">{m}</span>}
          </span>
        );
      })}
    </span>
  );
}

// What an item is for: the known reasons as checkboxes, and a field for a new one (several, with commas).
function ReasonPicker({ reasons, picked }: { reasons: string[]; picked: string[] }) {
  const options = [...picked, ...reasons.filter((r) => !picked.some((p) => p.toLowerCase() === r.toLowerCase()))];
  return (
    <details className="shop-for">
      <summary>For{picked.length > 0 && <span className="muted"> {picked.join(", ")}</span>}</summary>
      <div className="shop-for-body">
        <input name="newMeals" aria-label="New reason" placeholder="New reason (Stuffing, a party)" list="shop-meal-names" />
        {options.map((r) => (
          <label key={r} className="row"><input type="checkbox" name="meals" value={r} defaultChecked={picked.includes(r)} /> {r}</label>
        ))}
      </div>
    </details>
  );
}

function Item({ item, links, reasons }: { item: ShoppingItem; links: MealLinks; reasons: string[] }) {
  return (
    // Keyed by what's saved, so a row that waited on a tap starts fresh once the change is in.
    <ShopRow key={`${item.done}-${item.later}`} id={item.id} name={item.name} done={item.done} later={item.later}>
      {item.photo && (
        <a href={`/api/shopping/${item.id}/photo?v=${encodeURIComponent(item.photo)}`} className="shop-thumb" aria-label={`Photo of ${item.name}`}>
          <img src={`/api/shopping/${item.id}/photo?v=${encodeURIComponent(item.photo)}`} alt="" loading="lazy" />
        </a>
      )}
      <div className="shop-text">
        <span className="shop-name">{item.name}</span>
        {(item.qty || item.note) && <span className="muted shop-detail">{[item.qty, item.note].filter(Boolean).join(" · ")}</span>}
      </div>
      {(item.looking || item.meals.length > 0) && (
        <span className="shop-extra">
          {item.looking && <span className="shop-looking" role="status"><span className="spinner" aria-hidden="true" /> Finding its aisle…</span>}
          <MealTags meals={item.meals} links={links} />
        </span>
      )}
      {!item.done && (
        <details className="shop-edit">
          <summary aria-label={`Change ${item.name}`}>Change</summary>
          <div className="shop-edit-body">
            <form action={setShoppingAisle.bind(null, item.id)} className="row">
              <input name="aisle" aria-label="Aisle" placeholder="Aisle (4, Produce)" defaultValue={item.aisle} size={14} />
              <button>Save aisle</button>
            </form>
            <form action={setShoppingMeals.bind(null, item.id)} className="row">
              <ReasonPicker reasons={reasons} picked={item.meals} />
              <button>Save reasons</button>
            </form>
            <PhotoForm id={item.id} hasPhoto={item.photo !== ""} />
            <form action={removeShoppingItem.bind(null, item.id)}><button className="link danger">Remove</button></form>
          </div>
        </details>
      )}
    </ShopRow>
  );
}

export default async function Shopping() {
  const { groups, done, reasons, hidden } = shoppingList();
  const meals = getDb().prepare("SELECT id, name FROM meals ORDER BY name").all() as { id: number; name: string }[];
  const links: MealLinks = new Map(meals.map((m) => [m.name.toLowerCase(), m.id]));

  const open = groups.flatMap((g) => g.items);
  // One chip per reason on the list (and any that's switched off), then one for items with no reason.
  const onList = reasons.filter((r) => hidden.includes(r) || open.some((i) => i.meals.some((m) => m.toLowerCase() === r.toLowerCase())));
  const chips = [...onList, ...(open.some((i) => i.meals.length === 0) || hidden.includes(NO_REASON) ? [NO_REASON] : [])];
  const count = (reason: string) => open.filter((i) => (reason === NO_REASON ? i.meals.length === 0 : i.meals.some((m) => m.toLowerCase() === reason.toLowerCase()))).length;
  const shown = groups.map((g) => ({ ...g, items: g.items.filter((i) => isShown(i, hidden)) })).filter((g) => g.items.length > 0);
  const hiddenCount = open.length - shown.reduce((n, g) => n + g.items.length, 0);
  const looking = groups.some((g) => g.items.some((i) => i.looking));
  const storeMap = getStoreMap();

  return (
    <>
      <RefreshWhile active={looking} />
      <h1>Shopping</h1>
      <p className="lede">Everything grouped by aisle. Each item can say what it's for; switch a reason off to leave its items out of this trip. The clock is a quick way to mark an item Later.</p>

      <div className="shop-bar">
        <form action={addShoppingItem} className="shop-add">
          <input name="name" aria-label="Item" placeholder="Add an item (celery)" required />
          <input name="qty" aria-label="How much" placeholder="How much (1 bunch)" size={14} />
          <input name="aisle" aria-label="Aisle" placeholder="Aisle (optional)" size={12} />
          <ReasonPicker reasons={reasons} picked={[]} />
          <button className="primary">Add</button>
        </form>
        <datalist id="shop-meal-names">{meals.map((m) => <option key={m.id} value={m.name} />)}</datalist>

        {chips.length > 0 && (
          <div className="shop-reasons" role="group" aria-label="Reasons shown on this trip">
            {chips.map((r) => (
              <form key={r} action={toggleShoppingReason.bind(null, r)}>
                <button className="shop-reason" aria-pressed={!hidden.includes(r)} title={hidden.includes(r) ? "Hidden: tap to show these items" : "Shown: tap to hide these items"}>
                  {r === NO_REASON ? "No reason" : r} <span className="shop-reason-count">{count(r)}</span>
                </button>
              </form>
            ))}
          </div>
        )}
      </div>

      {shown.length === 0 && done.length === 0 && (
        <p className="empty">{hiddenCount > 0 ? "Nothing for this trip. Everything left is for a reason that's switched off." : "Nothing on the list yet."}</p>
      )}
      {shown.map((g) => (
        <section key={g.title} className="shop-group">
          <h2>{g.title} <span className="muted">({g.items.length})</span>{g.holds && <span className="shop-holds">{g.holds}</span>}</h2>
          <ul className="shop-list">{g.items.map((i) => <Item key={i.id} item={i} links={links} reasons={reasons} />)}</ul>
        </section>
      ))}
      {done.length > 0 && (
        <section className="shop-group">
          <div className="row">
            <h2>Done <span className="muted">({done.length})</span></h2>
            <form action={clearShoppingDone}><button>Clear done</button></form>
          </div>
          <ul className="shop-list">{done.map((i) => <Item key={i.id} item={i} links={links} reasons={reasons} />)}</ul>
        </section>
      )}

      <details className="shop-map">
        <summary>Store map <span className="muted">({storeMap.length} aisles known)</span></summary>
        <p className="muted">What each aisle holds, and the items known to be in it. New items are placed in the aisle that holds their kind of thing; type an aisle once and it's remembered.</p>
        {storeMap.length > 0 && (
          <dl className="shop-map-list">
            {storeMap.map((a) => (
              <div key={a.aisle}>
                <dt>Aisle {a.aisle}</dt>
                <dd>{a.holds && <span className="shop-holds-map">{a.holds}</span>}{a.items.length > 0 && <span>{a.items.join(", ")}</span>}</dd>
              </div>
            ))}
          </dl>
        )}
      </details>
    </>
  );
}
