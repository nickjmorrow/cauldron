import Link from "next/link";

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
