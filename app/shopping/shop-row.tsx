"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { changeShoppingItem } from "../actions.ts";

// A tap on the checkbox or clock shows at once but is only saved after this wait, so a slip can be tapped back
// before the row moves.
const GRACE_MS = 2000;

type Mark = { kind: "done" | "later"; value: boolean };

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

/** One shopping row: the checkbox and the clock beside it, then the rest of the row (rendered on the server). */
export function ShopRow({ id, name, done, later, children }: { id: number; name: string; done: boolean; later: boolean; children: ReactNode }) {
  const [mark, setMark] = useState<Mark | null>(null); // the tapped change, shown until the saved row replaces this one
  const waiting = useRef<{ mark: Mark; timer: number } | null>(null);

  const save = () => {
    const w = waiting.current;
    if (!w) return;
    clearTimeout(w.timer);
    waiting.current = null;
    void changeShoppingItem(id, { [w.mark.kind]: w.mark.value });
  };
  // Leaving the page saves a waiting change at once.
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => () => saveRef.current(), []);

  const shownDone = mark?.kind === "done" ? mark.value : done;
  const shownLater = mark?.kind === "later" ? mark.value : later;

  const toggle = (kind: Mark["kind"]) => {
    const w = waiting.current;
    if (w?.mark.kind === kind) {
      // A second tap on the same control takes the waiting change back.
      clearTimeout(w.timer);
      waiting.current = null;
      setMark(null);
      return;
    }
    save(); // a change to the other control was waiting: it goes through first
    const next = { kind, value: !(kind === "done" ? shownDone : shownLater) };
    waiting.current = { mark: next, timer: window.setTimeout(save, GRACE_MS) };
    setMark(next);
  };

  const classes = ["shop-item", shownDone && "is-done", shownLater && !shownDone && "is-later"].filter(Boolean).join(" ");
  return (
    <li className={classes}>
      <button type="button" className="shop-check" onClick={() => toggle("done")}
        aria-label={shownDone ? `Put ${name} back on the list` : `Check off ${name}`}>{shownDone && <Check />}</button>
      {!done && (
        <button type="button" className="shop-later" onClick={() => toggle("later")} disabled={shownDone} aria-pressed={shownLater}
          title={shownLater ? "Later: tap to get it this trip" : "This trip: tap to leave it for later"}
          aria-label={shownLater ? `Get ${name} this trip` : `Leave ${name} for later`}>
          <Clock on={shownLater} />
        </button>
      )}
      {children}
    </li>
  );
}
