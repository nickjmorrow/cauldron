"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { changeShoppingItem } from "../actions.ts";

// A tap on the checkbox shows at once but is only saved after this wait, so a slip can be tapped back
// before the row moves.
const GRACE_MS = 2000;


const Check = () => (
  <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
    <path d="M3.5 8.5 6.5 11.5 12.5 4.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** One shopping row: the checkbox, then the rest of the row (rendered on the server). */
export function ShopRow({ id, name, done, children }: { id: number; name: string; done: boolean; children: ReactNode }) {
  const [mark, setMark] = useState<boolean | null>(null); // the tapped change, shown until the saved row replaces this one
  const waiting = useRef<{ done: boolean; timer: number } | null>(null);

  const save = () => {
    const w = waiting.current;
    if (!w) return;
    clearTimeout(w.timer);
    waiting.current = null;
    void changeShoppingItem(id, { done: w.done });
  };
  // Leaving the page saves a waiting change at once.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => () => saveRef.current(), []);

  const shownDone = mark ?? done;

  const toggle = () => {
    const w = waiting.current;
    if (w) {
      // A second tap takes the waiting change back.
      clearTimeout(w.timer);
      waiting.current = null;
      setMark(null);
      return;
    }
    waiting.current = { done: !shownDone, timer: window.setTimeout(save, GRACE_MS) };
    setMark(!shownDone);
  };

  return (
    <li className={shownDone ? "shop-item is-done" : "shop-item"}>
      <button type="button" className="shop-check" onClick={toggle}
        aria-label={shownDone ? `Put ${name} back on the list` : `Check off ${name}`}>{shownDone && <Check />}</button>
      {children}
    </li>
  );
}
