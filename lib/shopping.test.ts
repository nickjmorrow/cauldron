import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

// Own database file, so the real one is never touched.
const FILE = "data/test-shopping.db";
process.env.CAULDRON_DB = FILE;
const { addItem, updateItem, removeItem, clearDone, listItems, groupItems, parseChange, aisleTitle, NO_AISLE, INBOX, NO_REASON, setPhoto, finishLookup, markLookingUp, getPhoto, removePhoto,
  isShown, getHidden, setHidden, parseHidden, listReasons, shoppingList } = await import("./shopping.ts");
const { PHOTOS_DIR, getDb } = await import("./db.ts");
const { buyName, mealsUsing } = await import("./item-meals.ts");

test.after(() => {
  for (const ext of ["", "-wal", "-shm"]) rmSync(FILE + ext, { force: true });
  rmSync(PHOTOS_DIR, { recursive: true, force: true });
});

const item = (name: string, aisle = "", extra: { done?: boolean; looking?: boolean; meals?: string[] } = {}) =>
  ({ id: 0, name, qty: "", aisle, later: (extra.meals ?? []).includes("Later"), done: false, note: "", photo: "", aisleFrom: "", looking: false, meals: [] as string[], ...extra });

test("numbered aisles come first in walking order, then named areas, then items with no aisle", () => {
  const list = groupItems([
    item("Rice", "10"), item("Apples", "Produce"), item("Soy sauce", "4"), item("Mystery"), item("Bread", "2"),
    item("Sponges", "7", { meals: ["Later"] }), item("Noodles", "4"),
  ]);
  assert.deepEqual(list.groups.map((g) => [g.title, g.items.map((i) => i.name)]), [
    ["Aisle 2", ["Bread"]], ["Aisle 4", ["Noodles", "Soy sauce"]], ["Aisle 7", ["Sponges"]], ["Aisle 10", ["Rice"]],
    ["Produce", ["Apples"]], [NO_AISLE, ["Mystery"]],
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
  assert.deepEqual(celery, { id: celery.id, name: "Celery", qty: "1 bunch", aisle: "Produce", later: false, done: false, note: "", photo: "", aisleFrom: "you", looking: false, meals: [] });
  assert.equal(updateItem(celery.id, { done: true })!.done, true);
  assert.equal(updateItem(celery.id, { done: false })!.done, false);
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
  assert.equal(addItem({ name: "Eggs" }).aisle, "Dairy & eggs"); // no aisle given or remembered: its store section
  assert.equal(addItem({ name: "Mystery thing" }).aisle, "");
  removeItem(eggs.id);
});

test("store sections sort in walking order, before other named areas", () => {
  const list = groupItems([item("Spatula", "Kitchen"), item("Hummus", "Deli"), item("Celery", "Produce"), item("Aspirin", "Pharmacy"), item("Rice", "3")]);
  assert.deepEqual(list.groups.map((g) => g.title), ["Aisle 3", "Produce", "Deli", "Kitchen", "Pharmacy"]);
});

test("a deleted item's id is never given to a new item", () => {
  const first = addItem({ name: "Pears" });
  removeItem(first.id);
  assert.ok(addItem({ name: "Plums" }).id > first.id);
});

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("a photo is stored with its type read from the file, replaced, and removed", () => {
  const tea = addItem({ name: "Tea" });
  const withPhoto = setPhoto(tea.id, JPEG) as { photo: string };
  assert.notEqual(withPhoto.photo, "");
  assert.deepEqual(getPhoto(tea.id), { bytes: Buffer.from(JPEG), type: "image/jpeg" });
  setPhoto(tea.id, PNG);
  assert.equal(getPhoto(tea.id)!.type, "image/png");
  assert.equal(removePhoto(tea.id)!.photo, "");
  assert.equal(getPhoto(tea.id), undefined);
  removeItem(tea.id);
});

test("a bad upload says what was wrong; an unknown item is not found", () => {
  const jam = addItem({ name: "Jam" });
  assert.match((setPhoto(jam.id, new Uint8Array()) as { error: string }).error, /request body/);
  assert.match((setPhoto(jam.id, new TextEncoder().encode("<svg></svg>")) as { error: string }).error, /JPEG, PNG/);
  assert.match((setPhoto(jam.id, new Uint8Array(10 * 1024 * 1024 + 1).fill(0xff)) as { error: string }).error, /over 10 MB/);
  assert.equal(setPhoto(999999, JPEG), undefined);
  removeItem(jam.id);
});

test("an item added again gets the last photo of the same name, and deleting an item deletes its photo", () => {
  const first = addItem({ name: "Oat milk" });
  setPhoto(first.id, JPEG);
  updateItem(first.id, { done: true });
  clearDone();
  const again = addItem({ name: "oat milk" });
  assert.notEqual(again.photo, "");
  assert.equal(getPhoto(again.id)!.type, "image/jpeg");
  removeItem(again.id);
  assert.equal(getPhoto(again.id), undefined);
  assert.equal(addItem({ name: "Butter" }).photo, "");
});

test("an added item says where its aisle came from, and only a guessed one is looked up", () => {
  assert.deepEqual(pick(addItem({ name: "Kale", aisle: "Produce" }, { lookUp: true })), ["Produce", "you", false]);
  assert.deepEqual(pick(addItem({ name: "kale" }, { lookUp: true })), ["Produce", "remembered", false]);
  assert.deepEqual(pick(addItem({ name: "Farro" }, { lookUp: true })), ["", "guess", true]);
  assert.deepEqual(pick(addItem({ name: "Couscous" })), ["", "guess", false]);
});
const pick = (i: { aisle: string; aisleFrom: string; looking: boolean }) => [i.aisle, i.aisleFrom, i.looking];

test("a finished lookup sets the store's aisle, unless the aisle was set by hand meanwhile", () => {
  const a = addItem({ name: "Tahini" }, { lookUp: true });
  assert.deepEqual(pick(finishLookup(a.id, "Aisle 09")!), ["9", "store", false]);
  const b = addItem({ name: "Miso" }, { lookUp: true });
  updateItem(b.id, { aisle: "3" });
  assert.deepEqual(pick(finishLookup(b.id, "12")!), ["3", "you", false]);
  const c = addItem({ name: "Ketchup" }, { lookUp: true });
  assert.deepEqual(pick(finishLookup(c.id, undefined)!), ["", "guess", false]); // nothing found: no aisle yet
  markLookingUp(c.id);
});

test("an item can say which meals it's for", () => {
  assert.deepEqual(parseChange({ name: "Celery", meals: [" Stuffing ", "Stuffing", ""] }, { needsName: true }), { name: "Celery", meals: ["Stuffing"] });
  assert.match((parseChange({ meals: "Stuffing" }, { needsName: false }) as { error: string }).error, /list of names/);
  const item = addItem({ name: "Sage", meals: ["Stuffing"] });
  assert.deepEqual(item.meals, ["Stuffing"]);
  assert.deepEqual(updateItem(item.id, { meals: ["Stuffing", "Roast chicken"] })!.meals, ["Stuffing", "Roast chicken"]);
});

test("items whose aisle is being looked up wait in the Inbox, first, and leave it when the lookup ends", () => {
  const list = groupItems([item("Rice", "3"), item("Farro", "", { looking: true }), item("Capers", "Produce", { looking: true })]);
  assert.deepEqual(list.groups.map((g) => [g.title, g.items.map((i) => i.name)]), [[INBOX, ["Capers", "Farro"]], ["Aisle 3", ["Rice"]]]);
  assert.deepEqual(groupItems([item("Rice", "3"), item("Farro")]).groups.map((g) => g.title), ["Aisle 3", NO_AISLE]);
});

test("an item shows when any of its reasons is on, unless it is Later and Later is off; one with no reason follows the no-reason switch", () => {
  assert.equal(isShown(item("Sponges", "7", { meals: ["Later"] }), ["later"]), false);
  assert.equal(isShown(item("Sage", "", { meals: ["Later", "Stuffing"] }), ["Later"]), false); // Later hides it whatever else it's for
  assert.equal(isShown(item("Sage", "", { meals: ["Later", "Stuffing"] }), ["Stuffing"]), true);
  assert.equal(isShown(item("Sage", "", { meals: ["Chili", "Stuffing"] }), ["Stuffing"]), true);
  assert.equal(isShown(item("Sage", "", { meals: ["Chili", "Stuffing"] }), ["Stuffing", "chili"]), false);
  assert.equal(isShown(item("Eggs"), ["Later"]), true);
  assert.equal(isShown(item("Eggs"), [NO_REASON]), false);
  assert.equal(isShown(item("Sage", "", { meals: ["Stuffing"] }), [NO_REASON]), true);
});

test("hidden reasons are stored and checked; the list carries them with the reasons to pick from", () => {
  assert.deepEqual(parseHidden({ hidden: [" Later ", "Later", ""] }), ["Later", ""]);
  assert.match((parseHidden({ hidden: "Later" }) as { error: string }).error, /hidden/);
  assert.match((parseHidden(null) as { error: string }).error, /hidden/);
  setHidden(["Later", ""]);
  assert.deepEqual(getHidden(), ["", "Later"]);
  setHidden([]);
  assert.deepEqual(shoppingList().hidden, []);
});

test("reasons on the list come first A to Z, then ones used before; a new reason is offered as soon as an item has it", () => {
  const old = addItem({ name: "Candles", meals: ["Birthday"] });
  updateItem(old.id, { done: true });
  clearDone();
  addItem({ name: "Soap", meals: ["House"] });
  const reasons = listReasons();
  assert.ok(reasons.includes("House") && reasons.includes("Stuffing"));
  assert.ok(reasons.indexOf("House") < reasons.indexOf("Birthday"));
  assert.equal(reasons.filter((r) => r.toLowerCase() === "stuffing").length, 1);
});

test("an item added with no reason is for the meals that use it: typical-day meals first, then occasional ones, and no others", () => {
  const db = getDb();
  const id = (sql: string, ...args: (string | number)[]) => Number(db.prepare(sql).run(...args).lastInsertRowid);
  const leek = id("INSERT INTO ingredients (name, serving, status) VALUES ('Leeks, raw', '100 g', 'approved')");
  const meal = (name: string, occasional = 0) => {
    const m = id("INSERT INTO meals (name, status, occasional) VALUES (?, 'approved', ?)", name, occasional);
    db.prepare("INSERT INTO meal_items (meal_id, ingredient_id, qty) VALUES (?, ?, 1)").run(m, leek);
    return m;
  };
  meal("Braise", 1);
  const soup = meal("Leek soup");
  meal("Abandoned tart");
  const day = id("INSERT INTO days (name, position) VALUES ('Standard day', 1)");
  const slot = id("INSERT INTO day_slots (day_id, name, position) VALUES (?, 'Lunch', 1)", day);
  db.prepare("INSERT INTO slot_options (slot_id, meal_id, is_planned) VALUES (?, ?, 1)").run(slot, soup);

  assert.equal(buyName("Celery, Raw"), "celery");
  assert.equal(buyName("Eggs (large)"), "egg");
  assert.deepEqual(mealsUsing("leek"), ["Leek soup", "Braise"]);
  assert.deepEqual(mealsUsing("Leek soup mix"), []);
  assert.deepEqual(addItem({ name: "Leeks" }).meals, ["Leek soup", "Braise"]);
  assert.deepEqual(addItem({ name: "Leeks", meals: ["Party"] }).meals, ["Party"]); // a given reason wins
  assert.deepEqual(addItem({ name: "Batteries" }).meals, []);
});

test("items set for later before reasons existed get the reason Later, which starts hidden", async () => {
  const { migrateLater } = await import("./db.ts");
  const db = getDb();
  db.prepare("INSERT INTO shopping_items (name, later, meals) VALUES ('Old sponge', 1, '[\"House\"]')").run();
  migrateLater(db);
  assert.deepEqual(listItems().find((i) => i.name === "Old sponge")!.meals, ["House", "Later"]);
  assert.deepEqual(getHidden(), ["Later"]);
  setHidden([]);
  migrateLater(db); // nothing left to move: the choice to show Later again stays
  assert.deepEqual(getHidden(), []);
});

test("later is the reason Later: the flag gives or takes it and leaves other reasons alone", () => {
  const foil = addItem({ name: "Foil", later: true });
  assert.deepEqual([foil.later, foil.meals], [true, ["Later"]]);
  const now = updateItem(foil.id, { later: false })!;
  assert.deepEqual([now.later, now.meals], [false, []]);
  const tagged = updateItem(foil.id, { meals: ["House", "later"] })!;
  assert.equal(tagged.later, true);
  assert.deepEqual(updateItem(foil.id, { later: false })!.meals, ["House"]);
  assert.deepEqual(updateItem(foil.id, { later: true })!.meals, ["House", "Later"]);
});
