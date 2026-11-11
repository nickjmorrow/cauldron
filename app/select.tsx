"use client";
import { useEffect, useId, useRef, useState } from "react";

export type Option = { value: string; label: string; hint?: string };

// Replacement for <select>: a searchable listbox that still submits through a normal form field.
export function Select({ name, options, placeholder, required, defaultValue = "", className }: {
  name: string; options: Option[]; placeholder: string; required?: boolean; defaultValue?: string; className?: string;
}) {
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [openUp, setOpenUp] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  const shown = options.filter((o) => o.label.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = options.find((o) => o.value === value);
  const searchable = options.length > 7;

  function show() {
    const rect = trigger.current!.getBoundingClientRect();
    const below = window.innerHeight - rect.bottom;
    setOpenUp(below < 280 && rect.top > below);
    setQuery("");
    setActive(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }
  function close(refocus = true) {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  }
  function choose(o: Option) {
    setValue(o.value);
    close();
  }

  useEffect(() => {
    if (!open) return;
    if (searchable) search.current?.focus();
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open, searchable]);

  useEffect(() => {
    list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  // A server action resets its form after submitting; put the choice back to its default.
  useEffect(() => {
    const form = trigger.current?.form;
    const reset = () => setValue(defaultValue);
    form?.addEventListener("reset", reset);
    return () => form?.removeEventListener("reset", reset);
  }, [defaultValue]);

  function onKey(e: React.KeyboardEvent) {
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(e.key)) { e.preventDefault(); show(); }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(shown.length - 1); }
    else if (e.key === "Enter" || (e.key === " " && !searchable)) { e.preventDefault(); if (shown[active]) choose(shown[active]); }
    else if (e.key === "Tab") setOpen(false);
  }

  return (
    <div ref={root} className={`select${className ? ` ${className}` : ""}`} onKeyDown={onKey}>
      {/* The real form field. Kept in the page (not display:none) so "required" can still show its message. */}
      <input className="select-field" name={name} value={value} required={required} tabIndex={-1} aria-hidden="true"
        onChange={() => {}} onFocus={() => trigger.current?.focus()} />
      <button type="button" ref={trigger} className="select-trigger" role="combobox" aria-haspopup="listbox"
        aria-expanded={open} aria-controls={`${id}-list`} onClick={() => (open ? close(false) : show())}>
        <span className={selected ? "" : "placeholder"}>{selected ? selected.label : placeholder}</span>
        <svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      {open && (
        <div className={`select-pop${openUp ? " up" : ""}`}>
          {searchable && (
            <input ref={search} className="select-search" placeholder="Type to filter" aria-label="Filter options" value={query}
              role="searchbox" aria-controls={`${id}-list`} aria-activedescendant={shown[active] ? `${id}-${active}` : undefined}
              onChange={(e) => { setQuery(e.target.value); setActive(0); }} />
          )}
          <ul ref={list} id={`${id}-list`} role="listbox" className="select-list">
            {shown.map((o, i) => (
              <li key={o.value} id={`${id}-${i}`} role="option" aria-selected={o.value === value}
                className={`${i === active ? "active" : ""}${o.value === value ? " chosen" : ""}`}
                onPointerDown={(e) => e.preventDefault()} onClick={() => choose(o)} onPointerMove={() => setActive(i)}>
                <span>{o.label}</span>{o.hint && <span className="muted">{o.hint}</span>}
              </li>
            ))}
            {shown.length === 0 && <li className="none" role="presentation">No match</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
