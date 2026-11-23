"use client";
import { useRouter } from "next/navigation";
import { useEffect, type MouseEvent } from "react";
import { toggleShoppingReason } from "../actions.ts";

export type Chip = { reason: string; title: string; count: number; hidden: boolean };

/**
 * The reason chips. A click switches a reason on or off for every client (saved). Shift+click focuses one reason:
 * only its items show, in this browser only, until shift+click on it again, Escape, or any plain click on a chip.
 * The focus lives in the address (?focus=), so nothing is saved.
 */
export function ReasonChips({ chips, focus }: { chips: Chip[]; focus: string | null }) {
  const router = useRouter();
  const setFocus = (reason: string | null) =>
    router.replace(reason === null ? "/shopping" : `/shopping?focus=${encodeURIComponent(reason)}`, { scroll: false });

  useEffect(() => {
    if (focus === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") router.replace("/shopping", { scroll: false }); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus, router]);

  const click = (e: MouseEvent, reason: string) => {
    if (e.shiftKey) { e.preventDefault(); setFocus(focus === reason ? null : reason); return; }
    // A plain click while focused only ends the focus, so no switch is flipped by accident.
    if (focus !== null) { e.preventDefault(); setFocus(null); }
  };

  const title = (chip: Chip) => {
    if (focus === chip.reason) return "Only these items are showing: click or press Escape to show the rest";
    if (focus !== null) return "Click to show everything again";
    return `${chip.hidden ? "Hidden: click to show these items" : "Shown: click to hide these items"}. Shift+click to show only these`;
  };

  return (
    <div className={focus === null ? "shop-reasons" : "shop-reasons is-focusing"} role="group" aria-label="Reasons shown on this trip">
      {chips.map((chip) => (
        <form key={chip.reason} action={toggleShoppingReason.bind(null, chip.reason)}>
          <button className={focus === chip.reason ? "shop-reason is-focus" : "shop-reason"} title={title(chip)}
            aria-pressed={focus === null ? !chip.hidden : focus === chip.reason} onClick={(e) => click(e, chip.reason)}>
            {chip.title} <span className="shop-reason-count">{chip.count}</span>
          </button>
        </form>
      ))}
      {focus !== null && <button type="button" className="link" onClick={() => setFocus(null)}>Show all</button>}
    </div>
  );
}
