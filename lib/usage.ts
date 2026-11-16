// How often something gets eaten: in the typical day, in a meal cooked occasionally, or in no meal that counts
// (left over from iterating). The typical day wins when both apply.
export type Use = "day" | "occasional" | "unused";
export const USE_LABELS: Record<Use, string> = { day: "Typical day", occasional: "Occasional", unused: "Unused" };

export function useOf(id: number, day: Set<number>, occasional: Set<number>): Use {
  if (day.has(id)) return "day";
  if (occasional.has(id)) return "occasional";
  return "unused";
}

export type UseFilter = Use | "all";
// The ?show= value of a page listing meals or ingredients; the typical day when missing or unknown.
export function parseUseFilter(show: string | undefined): UseFilter {
  return show === "all" || show === "occasional" || show === "unused" ? show : "day";
}
