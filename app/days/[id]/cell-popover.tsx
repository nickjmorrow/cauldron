"use client";
import { useRef, useState } from "react";

// A table cell that opens a popover on hover, focus or tap. The popover is fixed-positioned,
// so the table's horizontal scroll cannot clip it; it flips above the cell near the bottom of the window.
export function CellPopover({ className, children, popover }: { className?: string; children: React.ReactNode; popover: React.ReactNode }) {
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
          {popover}
        </div>
      )}
    </td>
  );
}
