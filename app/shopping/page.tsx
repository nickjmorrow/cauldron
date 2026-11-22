import { groupItems, listItems, type ShoppingItem } from "../../lib/shopping.ts";
import { PhotoForm } from "./photo-form.tsx";
import { addShoppingItem, changeShoppingItem, clearShoppingDone, removeShoppingItem, setShoppingAisle } from "../actions.ts";

const Check = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

function Item({ item }: { item: ShoppingItem }) {
  return (
    <li className={item.done ? "shop-item is-done" : "shop-item"}>
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
      {!item.done && (
        <details className="shop-edit">
          <summary aria-label={`Change ${item.name}`}>Change</summary>
          <div className="shop-edit-body">
            <form action={setShoppingAisle.bind(null, item.id)} className="row">
              <input name="aisle" aria-label="Aisle" placeholder="Aisle (4, Produce)" defaultValue={item.aisle} size={14} />
              <button>Save aisle</button>
            </form>
            <PhotoForm id={item.id} hasPhoto={item.photo !== ""} />
            <div className="row">
              <form action={changeShoppingItem.bind(null, item.id, { later: !item.later })}><button>{item.later ? "Move to this trip" : "Move to later"}</button></form>
              <form action={removeShoppingItem.bind(null, item.id)}><button className="link danger">Remove</button></form>
            </div>
          </div>
        </details>
      )}
    </li>
  );
}

export default function Shopping() {
  const { groups, done } = groupItems(listItems());
  const openCount = groups.reduce((n, g) => n + g.items.length, 0);

  return (
    <>
      <h1>Shopping</h1>
      <p className="lede">This trip's items in aisle order, with a later pile for everything else. An item remembers its aisle and photo the next time you add it.</p>

      <form action={addShoppingItem} className="add shop-add">
        <input name="name" aria-label="Item" placeholder="Add an item (celery)" required />
        <input name="qty" aria-label="How much" placeholder="How much (1 bunch)" size={14} />
        <input name="aisle" aria-label="Aisle" placeholder="Aisle (4, Produce)" size={14} />
        <label className="row"><input type="checkbox" name="later" /> Later</label>
        <button className="primary">Add</button>
      </form>

      {openCount === 0 && done.length === 0 && <p className="empty">Nothing on the list yet.</p>}
      {groups.map((g) => (
        <section key={g.title} className="shop-group">
          <h2>{g.title} <span className="muted">({g.items.length})</span></h2>
          <ul className="shop-list">{g.items.map((i) => <Item key={i.id} item={i} />)}</ul>
        </section>
      ))}
      {done.length > 0 && (
        <section className="shop-group">
          <div className="row">
            <h2>Done <span className="muted">({done.length})</span></h2>
            <form action={clearShoppingDone}><button>Clear done</button></form>
          </div>
          <ul className="shop-list">{done.map((i) => <Item key={i.id} item={i} />)}</ul>
        </section>
      )}
    </>
  );
}
