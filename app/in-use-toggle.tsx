import Link from "next/link";
import { USE_LABELS, type Use, type UseFilter } from "../lib/usage.ts";

// Switch a list between what the Day tab actually uses (the default) and the whole collection.
export function InUseToggle({ showAll, used, total, href }: { showAll: boolean; used: number; total: number; href: (all: boolean) => string }) {
  return (
    <div className="toggle-group" role="group" aria-label="Which to show">
      <Link href={href(false)} className="toggle" aria-current={showAll ? undefined : "true"}>In use ({used})</Link>
      <Link href={href(true)} className="toggle" aria-current={showAll ? "true" : undefined}>All ({total})</Link>
    </div>
  );
}

export const isShowAll = (show: string | undefined) => show === "all";

// Switch a list between the typical day (the default), occasional meals, unused leftovers and everything.
export function UseFilterToggle({ current, counts, href }: {
  current: UseFilter; counts: Record<UseFilter, number>; href: (filter: UseFilter) => string;
}) {
  const filters: [UseFilter, string][] = [...(Object.entries(USE_LABELS) as [UseFilter, string][]), ["all", "All"]];
  return (
    <div className="toggle-group" role="group" aria-label="Which to show">
      {filters.map(([filter, label]) => (
        <Link key={filter} href={href(filter)} className="toggle" aria-current={current === filter ? "true" : undefined}>{label} ({counts[filter]})</Link>
      ))}
    </div>
  );
}

export function countByUse<T>(items: T[], useOfItem: (item: T) => Use): Record<UseFilter, number> {
  const counts: Record<UseFilter, number> = { day: 0, occasional: 0, unused: 0, all: items.length };
  for (const item of items) counts[useOfItem(item)]++;
  return counts;
}
