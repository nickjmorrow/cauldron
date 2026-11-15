"use client";
import { useRef, type ReactNode } from "react";

// A meal block that opens a dialog with what is in the meal and how to change it.
export function MealDialog({ label, trigger, title, subtitle, children }: {
  label: string; trigger: ReactNode; title: string; subtitle: string; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" className="meal-open" aria-haspopup="dialog" aria-label={label} title="See what's in it and change the portion"
        onClick={() => dialog.current?.showModal()}>
        {trigger}
      </button>
      <dialog ref={dialog} className="meal-dialog" aria-label={title}
        onClick={(e) => { if (e.target === e.currentTarget) e.currentTarget.close(); }}>
        <header>
          <div>
            <h3>{title}</h3>
            <p className="muted">{subtitle}</p>
          </div>
          <button type="button" className="icon" aria-label="Close" onClick={() => dialog.current?.close()}>×</button>
        </header>
        {children}
      </dialog>
    </>
  );
}
