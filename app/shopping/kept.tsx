"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Items checked off since the list was last tidied stay in their aisle, crossed out, so the rows below don't jump.
// This browser remembers which in a session cookie the page reads (lib/shopping.ts groupItems `kept`).
const COOKIE = "shop_kept";

function read(): number[] {
  const value = document.cookie.split("; ").find((c) => c.startsWith(COOKIE + "="))?.slice(COOKIE.length + 1) ?? "";
  return value.split(".").map(Number).filter((n) => Number.isInteger(n) && n > 0);
}

function write(ids: number[]) {
  document.cookie = ids.length > 0 ? `${COOKIE}=${ids.join(".")}; path=/; SameSite=Lax` : `${COOKIE}=; path=/; max-age=0; SameSite=Lax`;
}

export function keep(id: number, done: boolean) {
  const ids = read().filter((i) => i !== id);
  write(done ? [...ids, id] : ids);
}

// "Tidy up" moves the crossed-out items to Done. Leaving the page (another tab, another page) tidies too, and coming
// back shows the tidied list.
export function Tidy({ count }: { count: number }) {
  const router = useRouter();
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") write([]);
      else router.refresh();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      write([]);
    };
  }, [router]);
  if (count === 0) return null;
  return <button type="button" className="shop-tidy" onClick={() => { write([]); router.refresh(); }}>Tidy up ({count})</button>;
}
