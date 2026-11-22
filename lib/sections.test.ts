import { test } from "node:test";
import assert from "node:assert/strict";
import { guessSection } from "./sections.ts";

test("an item's store section is guessed from its name, the more specific words first", () => {
  const cases: [string, string][] = [
    ["Celery", "Produce"], ["Fresh parsley", "Produce"], ["Yellow onion", "Produce"], ["Avocados", "Produce"],
    ["Tomato paste", "Pantry"], ["Low-sodium chicken broth", "Pantry"], ["Herb Seasoned Cubed Stuffing", "Pantry"],
    ["Turkey", "Meat & seafood"], ["Eggs", "Dairy & eggs"], ["Unsalted butter", "Dairy & eggs"],
    ["Rice vinegar, unseasoned", "Condiments & sauces"], ["Toasted sesame oil", "Condiments & sauces"],
    ["Pickled jalapeños", "Condiments & sauces"], ["Lime juice", "Condiments & sauces"], ["Maple syrup", "Condiments & sauces"],
    ["Baking powder", "Baking & spices"], ["Sesame seeds", "Baking & spices"],
    ["Hummus", "Deli"], ["Oven cleaner", "Household"], ["Scrub sponges", "Household"],
    ["Frozen peas", "Frozen"], ["Something odd", ""],
  ];
  for (const [name, section] of cases) assert.equal(guessSection(name), section, name);
});
