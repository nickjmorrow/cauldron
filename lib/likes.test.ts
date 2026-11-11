import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

// Own database file, so the real one is never touched.
const FILE = "data/test-likes.db";
process.env.CAULDRON_DB = FILE;
const { getDb } = await import("./db.ts");
const { likeFood, unlikeFood, listLikes, approveLike, rejectLike, validLikes, renameLikedSlot } = await import("./likes.ts");
const { pendingCount } = await import("./queries.ts");

test.after(() => { for (const ext of ["", "-wal", "-shm"]) rmSync(FILE + ext, { force: true }); });

const db = getDb();
const food = (name: string, dairy = 0, status = "approved") => Number(db.prepare("INSERT INTO ingredients (name, serving, status, contains_dairy, nutrients) VALUES (?, '100 g', ?, ?, '{}')").run(name, status, dairy).lastInsertRowid);
const eggs = food("Eggs"), oats = food("Oats"), yogurt = food("Greek yogurt", 1), maybe = food("Maybe", 0, "proposed");

test("a liked food is saved per meal and listed with its name", () => {
  assert.equal(likeFood(eggs, "Breakfast"), null);
  assert.equal(likeFood(eggs, "Breakfast"), null); // twice is fine
  assert.equal(likeFood(eggs, "Dinner"), null);
  assert.deepEqual(listLikes().map((l) => [l.name, l.slotName, l.status]), [["Eggs", "Breakfast", "approved"], ["Eggs", "Dinner", "approved"]]);
});

test("dairy and unapproved foods cannot be liked, and neither can unknown ones", () => {
  assert.match(likeFood(yogurt, "Breakfast")!, /dairy/i);
  assert.match(likeFood(maybe, "Breakfast")!, /approved/);
  assert.match(likeFood(99999, "Breakfast")!, /isn't a known food/);
  assert.equal(listLikes().length, 2);
});

test("a like can be removed", () => {
  unlikeFood(eggs, "Dinner");
  assert.deepEqual(listLikes().map((l) => l.slotName), ["Breakfast"]);
});

test("a proposed like waits for approval and can be rejected", () => {
  assert.equal(likeFood(oats, "Breakfast", "proposed"), null);
  assert.equal(listLikes().find((l) => l.name === "Oats")!.status, "proposed");
  approveLike(oats, "Breakfast");
  assert.equal(listLikes().find((l) => l.name === "Oats")!.status, "approved");
  likeFood(oats, "Dinner", "proposed");
  rejectLike(oats, "Dinner");
  assert.equal(listLikes().some((l) => l.name === "Oats" && l.slotName === "Dinner"), false);
});

test("approving never turns an already approved like back into a proposal", () => {
  likeFood(eggs, "Breakfast", "proposed");
  assert.equal(listLikes().find((l) => l.name === "Eggs" && l.slotName === "Breakfast")!.status, "approved");
});

test("renaming a slot keeps its liked foods", () => {
  renameLikedSlot("Breakfast", "First meal");
  assert.deepEqual([...new Set(listLikes().map((l) => l.slotName))], ["First meal"]);
});

test("what the AI returns is cut down to known foods and known slots", () => {
  const ingredients = [{ id: eggs, name: "Eggs" }, { id: oats, name: "Oats" }];
  const draft = { likes: [
    { slot: "Breakfast", foods: ["Eggs", "Oats", "Mystery food"] },
    { slot: "Midnight snack", foods: ["Eggs"] },
    { slot: "Dinner", foods: ["Oats", "Oats"] },
  ] };
  const { pairs, unmatched } = validLikes(draft, ingredients, ["Breakfast", "Dinner"]);
  assert.deepEqual(pairs, [{ ingredientId: eggs, slotName: "Breakfast" }, { ingredientId: oats, slotName: "Breakfast" }, { ingredientId: oats, slotName: "Dinner" }]);
  assert.deepEqual(unmatched.sort(), ["Mystery food", "meal “Midnight snack”"]);
});

test("proposed likes count as things waiting for approval", () => {
  const before = pendingCount();
  likeFood(oats, "Snack", "proposed");
  assert.equal(pendingCount(), before + 1);
  approveLike(oats, "Snack");
  assert.equal(pendingCount(), before);
});
