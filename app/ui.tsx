"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useActionState } from "react";
import type { GenerateState } from "./actions.ts";

const LINKS = [
  { href: "/days", label: "Day" },
  { href: "/meals", label: "Meals" },
  { href: "/ingredients", label: "Ingredients" },
  { href: "/kitchen", label: "Kitchen" },
  { href: "/targets", label: "Targets" },
  { href: "/review", label: "Review" },
];

export function Nav({ pending }: { pending: number }) {
  const path = usePathname();
  return (
    <nav aria-label="Main">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} aria-current={path.startsWith(l.href) ? "page" : undefined}>
          {l.label}
          {l.href === "/review" && pending > 0 && <span className="count">{pending}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function GenerateForm({ action, placeholder, label, children }: {
  action: (state: GenerateState, form: FormData) => Promise<GenerateState>;
  placeholder: string;
  label: string;
  children?: React.ReactNode; // extra fields, such as which day and version to fill
}) {
  const [state, run, pending] = useActionState(action, null);
  return (
    <form action={run} className="generate">
      <input name="request" aria-label={label} placeholder={placeholder} />
      {children}
      <button className="primary" disabled={pending}>{pending ? "Working on it…" : label}</button>
      {state && <p className="muted generate-note" role="status">{state.message}</p>}
    </form>
  );
}

export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="back">
      <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true">
        <path d="M7.5 2.5 4 6l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </Link>
  );
}
