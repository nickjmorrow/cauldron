import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

// Own database file, so the real one is never touched.
const FILE = "data/test-supplements.db";
process.env.CAULDRON_DB = FILE;
const { contributions, getSupplement, listSupplements, parseSupplement, removeSupplement, saveSupplement, supplementTotals } = await import("./supplements.ts");

test.after(() => { for (const ext of ["", "-wal", "-shm"]) rmSync(FILE + ext, { force: true }); });

const parsed = (input: object) => {
  const out = parseSupplement(input);
  if ("error" in out) throw new Error(out.error);
  return out;
};

test("a supplement needs only a name; the rest has defaults", () => {
  assert.deepEqual(parsed({ name: "  Fish oil " }), { name: "Fish oil", product: "", amount: "", time: "morning", note: "", status: "taking", nutrients: {} });
});

test("what is wrong with a supplement is said plainly", () => {
  const error = (input: unknown) => (parseSupplement(input) as { error: string }).error;
  assert.match(error([]), /JSON object/);
  assert.match(error({ name: " " }), /needs a name/);
  assert.match(error({ name: "Zinc", time: "noon" }), /time must be one of morning/);
  assert.match(error({ name: "Zinc", status: "paused" }), /status must be one of taking/);
  assert.match(error({ name: "Zinc", amount: 2 }), /amount must be text/);
  assert.match(error({ name: "Zinc", nutrients: { zink: 30 } }), /zink isn't a nutrient/);
  assert.match(error({ name: "Zinc", nutrients: { zinc: -1 } }), /Zinc must be a number, 0 or more/);
});

test("nutrients of 0 are left out", () => {
  assert.deepEqual(parsed({ name: "Zinc", nutrients: { zinc: 30, iron: 0 } }).nutrients, { zinc: 30 });
});

test("supplements are saved, listed in the order of the day, changed and removed", () => {
  const night = saveSupplement(parsed({ name: "Magnesium", time: "bedtime", amount: "2 capsules", nutrients: { magnesium: 200 } }));
  const morning = saveSupplement(parsed({ name: "Vitamin D", product: "1,000 IU softgel", amount: "1 softgel", nutrients: { vit_d: 1000 } }));
  saveSupplement(parsed({ name: "Fish oil", nutrients: { omega3: 1.2 } }));
  assert.deepEqual(listSupplements().map((s) => s.name), ["Fish oil", "Vitamin D", "Magnesium"]);
  assert.equal(getSupplement(morning.id)!.product, "1,000 IU softgel");

  const changed = saveSupplement({ ...night, amount: "1 capsule", nutrients: { magnesium: 100 } }, night.id);
  assert.equal(changed.id, night.id);
  assert.deepEqual(getSupplement(night.id)!.nutrients, { magnesium: 100 });

  assert.throws(() => saveSupplement(parsed({ name: "vitamin d" })), /already a supplement called/);
  assert.throws(() => saveSupplement(parsed({ name: "Fish oil" }), night.id), /already a supplement called/);

  removeSupplement(morning.id);
  assert.equal(getSupplement(morning.id), undefined);
});

test("only supplements being taken count toward the day", () => {
  const list = [
    { id: 1, ...parsed({ name: "A", nutrients: { zinc: 15, vit_d: 1000 } }) },
    { id: 2, ...parsed({ name: "B", nutrients: { zinc: 10 } }) },
    { id: 3, ...parsed({ name: "C", status: "sometimes", nutrients: { zinc: 50 } }) },
    { id: 4, ...parsed({ name: "D", status: "stopped", nutrients: { iron: 18 } }) },
  ];
  assert.deepEqual(supplementTotals(list), { zinc: 25, vit_d: 1000 });
});

test("a nutrient is over when food and supplements together pass its upper limit", () => {
  const rows = contributions({ zinc: 20, vit_d: 500, calories: 2000 }, { zinc: 25, vit_d: 1000, b12: 500 }, { zinc: 40, vit_d: 4000 });
  assert.deepEqual(rows, [
    { key: "zinc", food: 20, supplements: 25, total: 45, ceiling: 40, over: true },
    { key: "vit_d", food: 500, supplements: 1000, total: 1500, ceiling: 4000, over: false },
    { key: "b12", food: 0, supplements: 500, total: 500, ceiling: undefined, over: false },
  ]);
});
