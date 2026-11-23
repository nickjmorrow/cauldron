import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

// Own database file, so the real one is never touched. The network is never called: every test passes a fake fetch.
const FILE = "data/test-kroger.db";
process.env.CAULDRON_DB = FILE;
process.env.KROGER_CLIENT_ID = "test-id";
process.env.KROGER_CLIENT_SECRET = "test-secret";
process.env.KROGER_LOCATION_ID = "00000001";
const { readProducts, namesBrand, searchProducts, attachProductPhoto, krogerEnabled } = await import("./kroger.ts");
const { addItem, getItem, setPhoto, getPhoto } = await import("./shopping.ts");
const { PHOTOS_DIR } = await import("./db.ts");

test.after(() => {
  for (const ext of ["", "-wal", "-shm"]) rmSync(FILE + ext, { force: true });
  rmSync(PHOTOS_DIR, { recursive: true, force: true });
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 9, 9]);
const image = (name: string) => `https://images.example/${name}`;
const product = (brand: string, description: string, aisle?: string) => ({
  brand, description,
  images: [
    { perspective: "back", sizes: [{ size: "large", url: image("back") }] },
    { perspective: "front", featured: true, sizes: [{ size: "thumbnail", url: image("thumb") }, { size: "large", url: image(description) }] },
  ],
  aisleLocations: aisle ? [{ number: aisle, description: "Aisle" }] : [],
});
const SAUCES = { data: [product("Store Brand", "Store Brand Marinara"), product("Acme Homemade", "Acme Homemade Marinara Sauce", "06")] };

// A stand-in for fetch: the sign-in, a product search answering with `found`, and image downloads. Records what was asked.
function fakeFetch(found: unknown, imageBytes: Uint8Array = PNG) {
  const asked: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    if (url.endsWith("/connect/oauth2/token")) return Response.json({ access_token: "token", expires_in: 1800 });
    if (url.includes("/products?")) return Response.json(found);
    return new Response(new Uint8Array(imageBytes));
  }) as typeof fetch;
  return { fetcher, asked };
}

test("two searches sign in once, and ask for the item at the configured store", async () => {
  const { fetcher, asked } = fakeFetch(SAUCES);
  await searchProducts("Acme marinara", fetcher);
  const products = await searchProducts("Acme marinara", fetcher);
  assert.equal(asked.filter((u) => u.endsWith("/token")).length, 1);
  assert.match(asked.at(-1)!, /filter\.term=Acme\+marinara&filter\.locationId=00000001/);
  assert.deepEqual(products[1], { brand: "Acme Homemade", description: "Acme Homemade Marinara Sauce", imageUrl: image("Acme Homemade Marinara Sauce"), aisle: "6" });
});

test("a product's picture is its front image, and its aisle only a real aisle number", () => {
  const [noImages, named, zero] = readProducts({ data: [
    { brand: "Acme", description: "Plain" },
    { ...product("Acme", "Named", "PRODUCE") },
    { ...product("Acme", "Zero", "0") },
  ] });
  assert.deepEqual(noImages, { brand: "Acme", description: "Plain", imageUrl: "", aisle: "" });
  assert.equal(named.aisle, "");
  assert.equal(zero.aisle, "");
  assert.deepEqual(readProducts({ errors: "nope" }), []);
  assert.deepEqual(readProducts(null), []);
});

test("a name names a brand when the brand is in it, or it starts with the brand's first word", () => {
  assert.equal(namesBrand("Acme marinara", "Acme"), true);
  assert.equal(namesBrand("marinara, acme's", "Acme’s"), true);
  assert.equal(namesBrand("Acme marinara", "Acme Homemade"), true);
  assert.equal(namesBrand("Marinara", "Acme Homemade"), false);
  assert.equal(namesBrand("Celery", "Store Brand"), false);
  assert.equal(namesBrand("Fresh basil", "Fresh Fields"), false); // "fresh" is an ordinary word
  assert.equal(namesBrand("Celery", ""), false);
});

test("an item naming a brand gets that product's photo and aisle; a generic one gets nothing", async () => {
  const branded = addItem({ name: "Acme marinara" });
  const after = await attachProductPhoto(branded.id, branded.name, { onlyBranded: true }, fakeFetch(SAUCES).fetcher);
  assert.notEqual(after!.photo, "");
  assert.deepEqual([after!.aisle, after!.aisleFrom], ["6", "store"]);
  assert.deepEqual(getPhoto(branded.id)!.type, "image/png");

  const generic = addItem({ name: "Marinara" });
  assert.equal(await attachProductPhoto(generic.id, generic.name, { onlyBranded: true }, fakeFetch(SAUCES).fetcher), undefined);
  assert.equal(getItem(generic.id)!.photo, "");
});

test("asked for by hand, the best match is attached whatever its brand, replacing the photo", async () => {
  const item = addItem({ name: "Tomato sauce", aisle: "4" });
  setPhoto(item.id, PNG);
  const after = await attachProductPhoto(item.id, item.name, { onlyBranded: false }, fakeFetch(SAUCES, JPEG).fetcher);
  assert.equal(getPhoto(item.id)!.type, "image/jpeg");
  assert.deepEqual([after!.aisle, after!.aisleFrom], ["4", "you"]); // a typed aisle is never replaced
});

test("an automatic lookup keeps a photo the item already has", async () => {
  const item = addItem({ name: "Acme pesto" });
  setPhoto(item.id, PNG);
  assert.equal(await attachProductPhoto(item.id, item.name, { onlyBranded: true }, fakeFetch(SAUCES, JPEG).fetcher), undefined);
  assert.equal(getPhoto(item.id)!.type, "image/png");
});

test("no match, a file that isn't an image, or the store being unreachable leaves the item alone", async () => {
  const item = addItem({ name: "Acme vinegar" });
  assert.equal(await attachProductPhoto(item.id, item.name, { onlyBranded: false }, fakeFetch({ data: [] }).fetcher), undefined);
  assert.equal(await attachProductPhoto(item.id, item.name, { onlyBranded: false }, fakeFetch(SAUCES, new Uint8Array([1, 2, 3])).fetcher), undefined);
  const offline = (async () => { throw new Error("offline"); }) as unknown as typeof fetch;
  // The sign-in from the first test is still good, so this fails at the search.
  assert.equal(await attachProductPhoto(item.id, item.name, { onlyBranded: false }, offline), undefined);
  assert.equal(getItem(item.id)!.photo, "");
});

test("with a setting missing, product photos are off", () => {
  assert.equal(krogerEnabled(), true);
  const id = process.env.KROGER_CLIENT_ID;
  delete process.env.KROGER_CLIENT_ID;
  assert.equal(krogerEnabled(), false);
  process.env.KROGER_CLIENT_ID = id;
});
