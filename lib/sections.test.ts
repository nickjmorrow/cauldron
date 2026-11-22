import { test } from "node:test";
import assert from "node:assert/strict";
import { guessSection } from "./sections.ts";

test("an item's store section is guessed from its name, the more specific words first", () => {
  const cases: [string, string][] = [
    ["Celery", "Produce"], ["Fresh parsley", "Produce"], ["Yellow onion", "Produce"], ["Avocados", "Produce"],
    ["Turkey", "Meat & seafood"], ["Eggs", "Dairy & eggs"], ["Unsalted butter", "Dairy & eggs"], ["Hummus", "Deli"],
    ["Frozen peas", "Frozen"], ["Sourdough bread", "Bakery"],
    // Middle-of-store items have no named area: their aisle number has to be looked up or typed.
    ["Tomato paste", ""], ["Low-sodium chicken broth", ""], ["Herb Seasoned Cubed Stuffing", ""], ["Rice vinegar, unseasoned", ""],
    ["Toasted sesame oil", ""], ["Pickled jalapeños", ""], ["Lime juice", ""], ["Baking powder", ""], ["Oven cleaner", ""],
    ["Something odd", ""],
  ];
  for (const [name, section] of cases) assert.equal(guessSection(name), section, name);
});
