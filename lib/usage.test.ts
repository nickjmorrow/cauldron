import test from "node:test";
import assert from "node:assert/strict";
import { parseUseFilter, useOf } from "./usage.ts";

test("the typical day wins over occasional, and anything in neither is unused", () => {
  const day = new Set([1, 2]), occasional = new Set([2, 3]);
  assert.equal(useOf(1, day, occasional), "day");
  assert.equal(useOf(2, day, occasional), "day");
  assert.equal(useOf(3, day, occasional), "occasional");
  assert.equal(useOf(4, day, occasional), "unused");
});

test("the filter defaults to the typical day for a missing or unknown value", () => {
  assert.equal(parseUseFilter(undefined), "day");
  assert.equal(parseUseFilter("bogus"), "day");
  assert.equal(parseUseFilter("occasional"), "occasional");
  assert.equal(parseUseFilter("unused"), "unused");
  assert.equal(parseUseFilter("all"), "all");
});
