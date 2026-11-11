import test from "node:test";
import assert from "node:assert/strict";
import { healthCeilings, canTolerate, checkTolerance, okUpTo, PROTEIN_G_PER_KG } from "./guardrails.ts";
import type { Target } from "./compute.ts";

const atLeast: Target = { workout: null, rest: null, daily: 28, type: "at_least" };
const noMore: Target = { workout: null, rest: null, daily: 2300, type: "no_more_than" };
const aim: Target = { workout: 120, rest: 90, daily: null, type: null };

test("the protein ceiling follows body weight, with a fixed fallback when there is no profile", () => {
  assert.equal(healthCeilings(80).protein, Math.round(80 * PROTEIN_G_PER_KG));
  assert.equal(healthCeilings(null).protein, 200);
  assert.equal(healthCeilings(undefined).protein, 200);
});

test("nutrients with a published upper limit have a ceiling, and others do not", () => {
  const c = healthCeilings(80);
  for (const key of ["vit_a", "vit_c", "vit_d", "vit_e", "calcium", "iron", "zinc", "choline"] as const) assert.ok(c[key]! > 0, key);
  assert.equal(c.fiber, undefined);
  assert.equal(c.potassium, undefined);
});

test("only nutrients with a target that is not an upper limit can be okay to exceed", () => {
  assert.equal(canTolerate(aim), true);
  assert.equal(canTolerate(atLeast), true);
  assert.equal(canTolerate(noMore), false);
  assert.equal(canTolerate(undefined), false);
});

test("setting a tolerance is refused for upper-limit nutrients and above the ceiling", () => {
  const ceilings = healthCeilings(80);
  assert.match(checkTolerance("sodium", noMore, null, ceilings)!, /upper limit/);
  assert.match(checkTolerance("protein", aim, 400, ceilings)!, /176/);
  assert.match(checkTolerance("protein", aim, 0, ceilings)!, /more than 0/);
  assert.match(checkTolerance("zinc", undefined, null, ceilings)!, /no target/);
  assert.equal(checkTolerance("protein", aim, 150, ceilings), null);
  assert.equal(checkTolerance("fiber", atLeast, null, ceilings), null);
});

test("the most a tolerated nutrient may reach is the lower of the user's limit and the health ceiling", () => {
  assert.equal(okUpTo(undefined, 176), undefined);
  assert.equal(okUpTo({ okToExceed: false, upTo: 150 }, 176), undefined);
  assert.equal(okUpTo({ okToExceed: true, upTo: 150 }, 176), 150);
  assert.equal(okUpTo({ okToExceed: true, upTo: 300 }, 176), 176);
  assert.equal(okUpTo({ okToExceed: true, upTo: null }, 176), 176);
  assert.equal(okUpTo({ okToExceed: true, upTo: null }, undefined), Infinity);
});
