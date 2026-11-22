import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

// Own database file, so the real one is never touched.
const FILE = "data/test-shopping.db";
process.env.CAULDRON_DB = FILE;
const { addItem, updateItem, removeItem, clearDone, listItems, groupItems, parseChange, aisleTitle, NO_AISLE, LATER } = await import("./shopping.ts");

test.after(() => { for (const ext of ["", "-wal", "-shm"]) rmSync(FILE + ext, { force: true }); });

const item = (name: string, aisle = "", extra: { later?: boolean; done?: boolean } = {}) =>
  ({ id: 0, name, qty: "", aisle, later: false, done: false, note: "", ...extra });

test("numbered aisles come first in walking order, then named areas, then items with no aisle, then later", () => {
  const list = groupItems([
    item("Rice", "10"), item("Apples", "Produce"), item("Soy sauce", "4"), item("Mystery"), item("Bread", "2"),
    item("Sponges", "7", { later: true }), item("Noodles", "4"),
  ]);
  assert.deepEqual(list.groups.map((g) => [g.title, g.items.map((i) => i.name)]), [
    ["Aisle 2", ["Bread"]], ["Aisle 4", ["Noodles", "Soy sauce"]], ["Aisle 10", ["Rice"]],
    ["Produce", ["Apples"]], [NO_AISLE, ["Mystery"]], [LATER, ["Sponges"]],
  ]);
});

test("done items leave their group and are listed apart; empty groups are left out", () => {
  const list = groupItems([item("Bread", "2", { done: true }), item("Milk", "3")]);
  assert.deepEqual(list.groups.map((g) => g.title), ["Aisle 3"]);
  assert.deepEqual(list.done.map((i) => i.name), ["Bread"]);
});

test("an aisle number reads as 'Aisle n' and a named area as written", () => {
  assert.equal(aisleTitle("04"), "Aisle 4");
  assert.equal(aisleTitle("Deli"), "Deli");
  assert.equal(aisleTitle(""), NO_AISLE);
});

test("a change is cleaned up: text trimmed, 'Aisle 4' stored as '4'", () => {
  assert.deepEqual(parseChange({ name: "  Celery ", aisle: "Aisle 4", later: true }, { needsName: true }), { name: "Celery", aisle: "4", later: true });
  assert.deepEqual(parseChange({ aisle: "04" }, { needsName: false }), { aisle: "4" });
});

test("a bad change says what was wrong", () => {
  const error = (input: unknown, needsName = false) => (parseChange(input, { needsName }) as { error: string }).error;
  assert.match(error([]), /JSON object/);
  assert.match(error({ note: "x" }, true), /needs a name/);
  assert.match(error({ name: "  " }), /needs a name/);
  assert.match(error({ done: "yes" }), /done must be true or false/);
  assert.match(error({ qty: 2 }), /qty must be text/);
  assert.match(error({ name: "x".repeat(201) }), /longer than 200/);
  assert.match(error({}), /Nothing to change/);
  assert.match(error({ colour: "red" }), /Nothing to change/);
});

test("items are added, checked off, un-checked and removed", () => {
  const celery = addItem({ name: "Celery", qty: "1 bunch", aisle: "Produce" });
  assert.deepEqual(celery, { id: celery.id, name: "Celery", qty: "1 bunch", aisle: "Produce", later: false, done: false, note: "" });
  assert.equal(updateItem(celery.id, { done: true })!.done, true);
  assert.equal(updateItem(celery.id, { done: false, later: true })!.later, true);
  assert.equal(listItems().find((i) => i.id === celery.id)!.done, false);
  assert.equal(removeItem(celery.id), true);
  assert.equal(removeItem(celery.id), false);
  assert.equal(updateItem(celery.id, { done: true }), undefined);
});

test("clearing hides done items, and the next time one is added it remembers its aisle", () => {
  const broth = addItem({ name: "Chicken broth", aisle: "6" });
  const eggs = addItem({ name: "Eggs" });
  updateItem(broth.id, { done: true });
  clearDone();
  assert.deepEqual(listItems().map((i) => i.name), ["Eggs"]);
  assert.equal(addItem({ name: "chicken broth" }).aisle, "6");
  assert.equal(addItem({ name: "Chicken broth", aisle: "9" }).aisle, "9"); // a given aisle wins
  assert.equal(addItem({ name: "Eggs" }).aisle, "");
  removeItem(eggs.id);
});

test("a deleted item's id is never given to a new item", () => {
  const first = addItem({ name: "Pears" });
  removeItem(first.id);
  assert.ok(addItem({ name: "Plums" }).id > first.id);
});
