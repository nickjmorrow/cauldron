"use client";
import { useEffect, useState } from "react";
import { changeShoppingItem } from "../actions.ts";

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** What an item is for, on its row: the tags are a button that opens every known reason as a checkbox, plus a field
 *  for a new one. Each tick is saved at once. */
export function ReasonEditor({ id, name, picked: saved, reasons }: { id: number; name: string; picked: string[]; reasons: string[] }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(saved); // shown at once, ahead of the save
  // While it's closed, follow what's saved (a change made on another device).
  const savedKey = saved.join("|");
  useEffect(() => { if (!open) setPicked(saved); }, [savedKey, open]); // eslint-disable-line react-hooks/exhaustive-deps
  const [added, setAdded] = useState<string[]>([]);
  const [text, setText] = useState("");
  const options = [...added, ...picked.filter((p) => !added.some((a) => same(a, p)) && !reasons.some((r) => same(r, p))), ...reasons.filter((r) => !added.some((a) => same(a, r)))];

  const save = (next: string[]) => {
    setPicked(next);
    void changeShoppingItem(id, { meals: next });
  };
  const toggle = (reason: string) => save(picked.some((p) => same(p, reason)) ? picked.filter((p) => !same(p, reason)) : [...picked, reason]);
  const addNew = () => {
    const reason = text.trim();
    if (!reason) return;
    setText("");
    const known = options.find((o) => same(o, reason));
    if (!known) setAdded([reason, ...added]);
    if (!picked.some((p) => same(p, reason))) save([...picked, known ?? reason]);
  };

  return (
    <span className="shop-reason-edit">
      <button type="button" className={picked.length > 0 ? "shop-meals" : "shop-meals is-empty"} aria-expanded={open} onClick={() => setOpen(!open)}
        aria-label={picked.length > 0 ? `${name} is for ${picked.join(", ")}: change` : `Say what ${name} is for`}>
        {picked.length > 0 ? picked.join(", ") : "+ For"}
      </button>
      {open && (
        <span className="shop-reason-panel" role="group" aria-label={`What ${name} is for`}>
          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addNew(); } }}
            aria-label="New reason" placeholder="New reason, then Return" list="shop-meal-names" autoFocus />
          {options.map((r) => (
            <label key={r} className="row"><input type="checkbox" checked={picked.some((p) => same(p, r))} onChange={() => toggle(r)} /> {r}</label>
          ))}
          <button type="button" className="link" onClick={() => setOpen(false)}>Done</button>
        </span>
      )}
    </span>
  );
}
