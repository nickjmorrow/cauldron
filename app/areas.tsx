"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { UnusedFlag } from "./flags.tsx";
import { approvePlacement, deleteLocation, renameLocation, reorderLocations, unassignIngredient } from "./actions.ts";

export type Area = { id: number; name: string; items: { id: number; name: string; proposed: boolean; unused: boolean }[] };

const Chevron = ({ up }: { up?: boolean }) => (
  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" style={up ? { transform: "rotate(180deg)" } : undefined}>
    <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Check = () => (
  <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
    <path d="m2.5 6.5 2.3 2.3 4.7-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const Grip = () => (
  <svg viewBox="0 0 12 16" width="12" height="16" aria-hidden="true" fill="currentColor">
    {[3, 8, 13].flatMap((y) => [3, 9].map((x) => <circle key={`${x}${y}`} cx={x} cy={y} r="1.3" />))}
  </svg>
);

function AreaName({ area }: { area: Area }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(area.name);
  const [, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) input.current?.select(); }, [editing]);

  function save() {
    setEditing(false);
    if (draft.trim() && draft.trim() !== area.name) start(() => renameLocation(area.id, draft));
    else setDraft(area.name);
  }
  if (!editing) {
    return <button type="button" className="area-name" onClick={() => { setDraft(area.name); setEditing(true); }} title="Click to rename">{area.name}</button>;
  }
  return (
    <input ref={input} className="area-rename" value={draft} aria-label={`Rename ${area.name}`} autoFocus
      onChange={(e) => setDraft(e.target.value)} onBlur={save}
      onKeyDown={(e) => {
        if (e.key === "Enter") save();
        if (e.key === "Escape") { setDraft(area.name); setEditing(false); }
      }} />
  );
}

export function Areas({ areas }: { areas: Area[] }) {
  const [order, setOrder] = useState(areas.map((a) => a.id));
  const [dragging, setDragging] = useState<number | null>(null);
  const [armed, setArmed] = useState<number | null>(null);
  const [, start] = useTransition();
  const signature = areas.map((a) => a.id).join(",");
  useEffect(() => setOrder(areas.map((a) => a.id)), [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = new Map(areas.map((a) => [a.id, a]));
  const persist = (ids: number[]) => start(() => reorderLocations(ids));
  const move = (id: number, by: number) => {
    const from = order.indexOf(id), to = from + by;
    if (to < 0 || to >= order.length) return;
    const next = [...order];
    next.splice(to, 0, next.splice(from, 1)[0]);
    setOrder(next);
    persist(next);
  };
  const hover = (overId: number) => {
    if (dragging === null || dragging === overId) return;
    const next = order.filter((i) => i !== dragging);
    next.splice(order.indexOf(overId), 0, dragging);
    setOrder(next);
  };

  return (
    <div className="areas">
      {order.map((id, index) => {
        const area = byId.get(id);
        if (!area) return null;
        return (
          <section key={id} className={`area${dragging === id ? " dragging" : ""}`}
            draggable={armed === id} onDragStart={() => setDragging(id)} onDragOver={(e) => { e.preventDefault(); hover(id); }}
            onDragEnd={() => { setDragging(null); setArmed(null); persist(order); }}>
            <div className="area-head">
              <span className="grip" title="Drag to reorder" onPointerDown={() => setArmed(id)} onPointerUp={() => setArmed(null)}><Grip /></span>
              <AreaName area={area} />
              <span className="grow" />
              <button type="button" className="icon" aria-label={`Move ${area.name} earlier`} disabled={index === 0} onClick={() => move(id, -1)}><Chevron up /></button>
              <button type="button" className="icon" aria-label={`Move ${area.name} later`} disabled={index === order.length - 1} onClick={() => move(id, 1)}><Chevron /></button>
              <button type="button" className="link danger" onClick={() => start(() => deleteLocation(id))}>delete</button>
            </div>
            {area.items.length === 0 && <span className="muted">Nothing here yet</span>}
            {area.items.map((i) => (
              <span key={i.id} className={`chip${i.proposed ? " proposed" : ""}`}>{i.name}{i.unused && <UnusedFlag />}
                {i.proposed && <button type="button" className="link" aria-label={`Approve ${i.name} in ${area.name}`} title="Approve" onClick={() => start(() => approvePlacement(i.id, id))}><Check /></button>}
                <button type="button" className="link" aria-label={`${i.proposed ? "Reject" : "Take"} ${i.name} ${i.proposed ? "for" : "out of"} ${area.name}`} onClick={() => start(() => unassignIngredient(i.id, id))}>×</button>
              </span>
            ))}
          </section>
        );
      })}
    </div>
  );
}
