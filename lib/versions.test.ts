import test from "node:test";
import assert from "node:assert/strict";
import { parseVersionKey, nearestVersion, versionLabel } from "./versions.ts";

test("junk or missing URL parameters fall back to maintain and rest", () => {
  assert.deepEqual(parseVersionKey({ goal: "junk", kind: "nope" }), { goal: "maintain", kind: "rest" });
  assert.deepEqual(parseVersionKey({}), { goal: "maintain", kind: "rest" });
});

test("valid URL parameters are kept, each on its own", () => {
  assert.deepEqual(parseVersionKey({ goal: "bulk", kind: "workout" }), { goal: "bulk", kind: "workout" });
  assert.deepEqual(parseVersionKey({ goal: "cut" }), { goal: "cut", kind: "rest" });
});

test("nearestVersion prefers the exact match, then the same goal, then the same kind", () => {
  const cutWorkout = { kind: "workout", goal: "cut" } as const;
  const bulkRest = { kind: "rest", goal: "bulk" } as const;
  const versions = [cutWorkout, bulkRest];
  assert.equal(nearestVersion(versions), bulkRest); // default is maintain, rest: same kind wins
  assert.equal(nearestVersion(versions, { kind: "workout", goal: "cut" }), cutWorkout);
  assert.equal(nearestVersion(versions, { kind: "workout", goal: "bulk" }), bulkRest); // same goal beats same kind
  assert.equal(nearestVersion(versions, { kind: "rest", goal: "cut" }), cutWorkout);
  assert.equal(nearestVersion([], { kind: "rest", goal: "cut" }), undefined);
});

test("a version reads as its goal then its kind", () => {
  assert.equal(versionLabel({ goal: "maintain", kind: "rest" }), "Maintain · Rest");
  assert.equal(versionLabel({ goal: "bulk", kind: "workout" }), "Bulk · Workout");
});
