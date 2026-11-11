import "./globals.css";
import Link from "next/link";
import { pendingCount } from "../lib/queries.ts";
import { Nav } from "./ui.tsx";

export const metadata = { title: "Cauldron" };
export const dynamic = "force-dynamic";

// A cauldron with three bubbles rising out of it.
const Cauldron = () => (
  <svg viewBox="0 0 26 26" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 10.5c-2 1.8-3 4.3-2.2 7 .9 2.9 4.2 4.2 9.2 4.2s8.3-1.3 9.2-4.2c.8-2.7-.2-5.2-2.2-7" />
    <path d="M4.5 10.5h17" />
    <path d="M8.5 21.2 7.5 24M17.5 21.2l1 2.8" />
    <circle cx="10" cy="6.6" r="1.5" stroke="var(--sun)" fill="var(--sun)" fillOpacity="0.3" />
    <circle cx="14.4" cy="4.4" r="1.1" stroke="var(--sun)" fill="var(--sun)" fillOpacity="0.3" />
    <circle cx="17" cy="7.4" r="0.9" stroke="var(--sun)" fill="var(--sun)" fillOpacity="0.3" />
  </svg>
);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pending = pendingCount();
  return (
    <html lang="en">
      <head><meta name="darkreader-lock" /></head>
      <body>
        <header className="topbar">
          <Link href="/days" className="brand"><Cauldron />Cauldron</Link>
          <Nav pending={pending} />
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
