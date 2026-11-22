"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const EVERY_MS = 2000;

// Re-fetches the page every couple of seconds while something on it is still being worked out (an aisle lookup).
export function RefreshWhile({ active }: { active: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), EVERY_MS);
    return () => clearInterval(timer);
  }, [active, router]);
  return null;
}
