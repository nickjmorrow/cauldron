import type { Slot, SlotOption } from "./queries.ts";

export const partKey = (slotId: number, part: number) => `${slotId}.${part}`;

// The option eaten in each part of each slot: the one chosen for that part, else the planned one, else the first.
export function chosenOptions(slots: Slot[], chosen: Record<string, number> = {}): { slot: Slot; option: SlotOption }[] {
  return slots.flatMap((slot) => slot.parts.flatMap((p) => {
    const option = p.options.find((o) => o.optionId === chosen[partKey(slot.id, p.part)]) ?? p.options.find((o) => o.isPlanned) ?? p.options[0];
    return option ? [{ slot, option }] : [];
  }));
}
