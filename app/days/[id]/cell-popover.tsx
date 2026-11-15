"use client";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";

// A contributor: indexes into the table's list of names, the amount, and its share in whole percent.
export type PopItem = [meal: number, slot: number, amount: number, share: number];

// Names and fix links are sent once per table rather than once per cell, so switching versions stays light.
const PopShared = createContext<{ names: string[]; actions: Record<string, ReactNode> }>({ names: [], actions: {} });
export function PopProvider({ names, actions, children }: { names: string[]; actions: Record<string, ReactNode>; children: ReactNode }) {
  return <PopShared.Provider value={{ names, actions }}>{children}</PopShared.Provider>;
}

// A table cell that opens a popover on hover, focus or tap. The popover is fixed-positioned,
// so the table's horizontal scroll cannot clip it; it flips above the cell near the bottom of the window.
// It is built here from plain data: a version's table has hundreds of cells, and sending each popover as markup made every page several hundred KB.
export function CellPopover({ className, children, title, note, unit, items, actionKey }: {
  className?: string; children: ReactNode; title: string; note?: string; unit: string; items: PopItem[]; actionKey?: string;
}) {
  const { names, actions } = useContext(PopShared);
  const [at, setAt] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const cell = useRef<HTMLTableCellElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const open = () => {
    window.clearTimeout(timer.current);
    const r = cell.current!.getBoundingClientRect();
    const above = r.bottom > window.innerHeight - 260;
    setAt({ left: Math.max(8, Math.min(r.left, window.innerWidth - 340)), top: above ? r.top - 6 : r.bottom + 6, above });
  };
  const close = () => { timer.current = window.setTimeout(() => setAt(null), 120); };
  return (
    <td ref={cell} className={`${className ?? ""} has-pop`} tabIndex={0}
      onMouseEnter={open} onMouseLeave={close} onFocus={open}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) close(); }}
      onKeyDown={(e) => { if (e.key === "Escape") setAt(null); }}>
      {children}
      {at && (
        <div className="cell-pop" role="tooltip" style={{ left: at.left, top: at.top, transform: at.above ? "translateY(-100%)" : undefined }}>
          <div className="pop-title">{title}{note && <span className="muted"> · {note}</span>}</div>
          <div className="muted pop-sub">Main contributors</div>
          <ol className="pop-list">
            {items.map(([meal, slot, amount, share]) => (
              <li key={`${slot}-${meal}`}>
                <span>{names[meal]}<small className="muted"> {names[slot]}</small></span>
                <b>{amount} {unit}</b>
                <i>{share}%</i>
              </li>
            ))}
          </ol>
          {actionKey && actions[actionKey]}
        </div>
      )}
    </td>
  );
}
