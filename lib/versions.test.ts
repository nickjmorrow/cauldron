import test from "node:test";
import assert from "node:assert/strict";
import { nearestVersion, parseVersionKey, versionLabel } from "./versions.ts";

test("a junk or missing goal falls back to bulk", () => {
  assert.deepEqual(parseVersionKey({ goal: "junk" }), { goal: "bulk" });
  assert.deepEqual(parseVersionKey({}), { goal: "bulk" });
  assert.deepEqual(parseVersionKey({ goal: "maintain" }), { goal: "bulk" }); // maintain is gone
});

test("a valid goal is kept", () => {
  assert.deepEqual(parseVersionKey({ goal: "cut" }), { goal: "cut" });
});

test("nearestVersion prefers the asked goal, then the first version", () => {
  const cut = { goal: "cut" } as const;
  const bulk = { goal: "bulk" } as const;
  assert.equal(nearestVersion([cut, bulk]), bulk); // the default is bulk
  assert.equal(nearestVersion([cut, bulk], { goal: "cut" }), cut);
  assert.equal(nearestVersion([cut], { goal: "bulk" }), cut);
  assert.equal(nearestVersion([], { goal: "cut" }), undefined);
});

test("a version reads as its goal", () => {
  assert.equal(versionLabel({ goal: "bulk" }), "Bulk");
});
