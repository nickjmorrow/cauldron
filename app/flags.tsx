import type { Use } from "../lib/usage.ts";

// Says how often a meal or ingredient is eaten; unused gets the flag so leftovers stand out.
export function UseTag({ use }: { use: Use }) {
  if (use === "unused") return <UnusedFlag title="Not in the typical day or any occasional meal" />;
  return <span className={`badge use-${use}`}>{use === "day" ? "typical day" : "occasional"}</span>;
}

// Marks an ingredient that no meal uses. Words and a flag shape, so it doesn't rely on color.
export function UnusedFlag({ title = "Not in any meal" }: { title?: string }) {
  return (
    <span className="unused-flag" title={title}>
      <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
        <path d="M3 10.5V1.8M3 2.2h6.2L7.6 4.6l1.6 2.4H3" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      unused
    </span>
  );
}
