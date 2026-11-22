import Link from "next/link";
import { getDb } from "../../lib/db.ts";
import { getStoreMap } from "../../lib/store-map.ts";
import { groupItems, listItems, type ShoppingItem } from "../../lib/shopping.ts";
import { PhotoForm } from "./photo-form.tsx";
import { RefreshWhile } from "./refresh-while.tsx";
import { addShoppingItem, changeShoppingItem, clearShoppingDone, setShoppingLater, removeShoppingItem, setShoppingAisle, setShoppingMeals } from "../actions.ts";

const Check = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

// A clock: "later". Filled when the item is set for later.
const Clock = ({ on }: { on: boolean }) => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <circle cx="8" cy="8" r="6" fill={on ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 4.8V8l2.2 1.6" fill="none" stroke={on ? "var(--sun-ink)" : "currentColor"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

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

function Item({ item, links, showLater }: { item: ShoppingItem; links: MealLinks; showLater: boolean }) {
  const classes = ["shop-item", item.done && "is-done", item.later && !item.done && "is-later"].filter(Boolean).join(" ");
  return (
    <li className={classes}>
      <form action={changeShoppingItem.bind(null, item.id, { done: !item.done })}>
        <button className="shop-check" aria-label={item.done ? `Put ${item.name} back on the list` : `Check off ${item.name}`}>{item.done && <Check />}</button>
      </form>
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
        <form action={setShoppingLater.bind(null, item.id, !item.later, showLater)}>
          <button className="shop-later" aria-pressed={item.later} title={item.later ? "Later: tap to get it this trip" : "This trip: tap to leave it for later"}
            aria-label={item.later ? `Get ${item.name} this trip` : `Leave ${item.name} for later`}>
            <Clock on={item.later} />
          </button>
        </form>
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
              <input name="meals" aria-label="For meals or recipes" placeholder="For (Stuffing, Chili)" defaultValue={item.meals.join(", ")} list="shop-meal-names" size={22} />
              <button>Save</button>
            </form>
            <PhotoForm id={item.id} hasPhoto={item.photo !== ""} />
            <form action={removeShoppingItem.bind(null, item.id)}><button className="link danger">Remove</button></form>
          </div>
        </details>
      )}
    </li>
  );
}

export default async function Shopping({ searchParams }: { searchParams: Promise<{ later?: string; kept?: string }> }) {
  const params = await searchParams;
  const showLater = params.later === "show";
  const kept = Number(params.kept) || 0; // just set for later: stays on the page with an Undo
  const { groups, done } = groupItems(listItems());
  const meals = getDb().prepare("SELECT id, name FROM meals ORDER BY name").all() as { id: number; name: string }[];
  const links: MealLinks = new Map(meals.map((m) => [m.name.toLowerCase(), m.id]));

  const laterCount = groups.reduce((n, g) => n + g.items.filter((i) => i.later).length, 0);
  const shown = groups
    .map((g) => ({ ...g, items: showLater ? g.items : g.items.filter((i) => !i.later || i.id === kept) }))
    .filter((g) => g.items.length > 0);
  const keptItem = kept ? groups.flatMap((g) => g.items).find((i) => i.id === kept) : undefined;
  const looking = groups.some((g) => g.items.some((i) => i.looking));
  const storeMap = getStoreMap();

  return (
    <>
      <RefreshWhile active={looking} />
      <h1>Shopping</h1>
      <p className="lede">Everything grouped by aisle. The clock leaves an item for a later trip; later items stay hidden unless you show them.</p>

      <div className="shop-bar">
        <form action={addShoppingItem} className="shop-add">
          <input name="name" aria-label="Item" placeholder="Add an item (celery)" required />
          <input name="qty" aria-label="How much" placeholder="How much (1 bunch)" size={14} />
          <input name="meals" aria-label="For meals or recipes" placeholder="For (Stuffing)" list="shop-meal-names" size={16} />
          <input name="aisle" aria-label="Aisle" placeholder="Aisle (optional)" size={12} />
          <label className="row"><input type="checkbox" name="later" /> Later</label>
          <button className="primary">Add</button>
        </form>
        <datalist id="shop-meal-names">{meals.map((m) => <option key={m.id} value={m.name} />)}</datalist>

        {keptItem?.later && (
          <div className="shop-undo" role="status">
            <span>{keptItem.name} is set for later.</span>
            <form action={setShoppingLater.bind(null, keptItem.id, false, false)}><button className="link">Undo</button></form>
          </div>
        )}
        {laterCount > 0 && (
          <p className="shop-later-toggle">
            <Link href={showLater ? "/shopping" : "/shopping?later=show"} replace scroll={false}>
              {showLater ? `Hide later items (${laterCount})` : `Show later items (${laterCount})`}
            </Link>
          </p>
        )}
      </div>

      {shown.length === 0 && done.length === 0 && (
        <p className="empty">{laterCount > 0 ? "Nothing for this trip. Everything left is set for later." : "Nothing on the list yet."}</p>
      )}
      {shown.map((g) => (
        <section key={g.title} className="shop-group">
          <h2>{g.title} <span className="muted">({g.items.length})</span></h2>
          <ul className="shop-list">{g.items.map((i) => <Item key={i.id} item={i} links={links} showLater={showLater} />)}</ul>
        </section>
      ))}
      {done.length > 0 && (
        <section className="shop-group">
          <div className="row">
            <h2>Done <span className="muted">({done.length})</span></h2>
            <form action={clearShoppingDone}><button>Clear done</button></form>
          </div>
          <ul className="shop-list">{done.map((i) => <Item key={i.id} item={i} links={links} showLater={showLater} />)}</ul>
        </section>
      )}

      <details className="shop-map">
        <summary>Store map <span className="muted">({storeMap.length} aisles known)</span></summary>
        <p className="muted">The aisles your items are known to be in. New items are placed next to things of the same kind; type an aisle once and it's remembered.</p>
        {storeMap.length > 0 && (
          <dl className="shop-map-list">
            {storeMap.map((a) => (
              <div key={a.aisle}>
                <dt>Aisle {a.aisle}</dt>
                <dd>{a.items.join(", ")}</dd>
              </div>
            ))}
          </dl>
        )}
      </details>
    </>
  );
}
