"use client";
import { useEffect, useRef, useState, useTransition } from "react";

// Shows a name; "Rename" turns it into a text field. The action returns a message when the name is refused.
export function InlineName({ id, name, action, children, className }: {
  id: number; name: string; action: (id: number, name: string) => Promise<string | void>;
  children: (startRename: () => void) => React.ReactNode; className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState("");
  const [, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (editing) input.current?.select(); }, [editing]);

  function save() {
    if (!draft.trim() || draft.trim() === name) { setEditing(false); setDraft(name); setError(""); return; }
    start(async () => {
      const problem = await action(id, draft);
      if (problem) setError(problem);
      else { setEditing(false); setError(""); }
    });
  }
  if (!editing) return <>{children(() => { setDraft(name); setError(""); setEditing(true); })}</>;
  return (
    <span className={`inline-name ${className ?? ""}`}>
      <input ref={input} value={draft} aria-label={`Rename ${name}`} aria-invalid={!!error} autoFocus
        onChange={(e) => { setDraft(e.target.value); setError(""); }}
        onBlur={() => { if (!error) save(); }}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") { setEditing(false); setDraft(name); setError(""); }
        }} />
      {error && <span className="field-error" role="alert">{error}</span>}
    </span>
  );
}

// Page title with a Rename link. A client component of its own so a server page can use it.
export function RenameTitle({ id, name, action }: {
  id: number; name: string; action: (id: number, name: string) => Promise<string | void>;
}) {
  return (
    <InlineName id={id} name={name} action={action} className="title">
      {(rename) => <>{name} <button type="button" className="link rename-link" onClick={rename}>Rename</button></>}
    </InlineName>
  );
}

// A name inside a table cell or list row, followed by whatever the server wants beside it (badges, counts).
export function RenameLabel({ id, name, action, after }: {
  id: number; name: string; action: (id: number, name: string) => Promise<string | void>; after?: React.ReactNode;
}) {
  return (
    <InlineName id={id} name={name} action={action}>
      {(rename) => <>{name}{after}<button type="button" className="link rename-link" onClick={rename}>rename</button></>}
    </InlineName>
  );
}
