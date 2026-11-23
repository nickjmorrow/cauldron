import { test } from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";

// Own database file, so the real one is never touched. Neither claude nor the network is called: every test passes stand-ins.
const FILE = "data/test-product-photos.db";
process.env.CAULDRON_DB = FILE;
const { readImages, attachProductPhoto, queueProductPhoto, productPhotosEnabled } = await import("./product-photos.ts");
const { addItem, getItem, setPhoto, getPhoto } = await import("./shopping.ts");
const { PHOTOS_DIR } = await import("./db.ts");

test.after(() => {
  for (const ext of ["", "-wal", "-shm"]) rmSync(FILE + ext, { force: true });
  rmSync(PHOTOS_DIR, { recursive: true, force: true });
});

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 9, 9]);
const NOT_AN_IMAGE = new Uint8Array([1, 2, 3]);
const FRONT = "https://images.example/front.jpg", SIDE = "https://images.example/side.png";

// A stand-in for fetch that serves the given files and answers 404 for anything else. Records what was asked.
function fakeFetch(files: Record<string, Uint8Array>) {
  const asked: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    return files[url] ? new Response(new Uint8Array(files[url])) : new Response("", { status: 404 });
  }) as typeof fetch;
  return { fetcher, asked };
}
// A stand-in for the search: a name starting with "Acme" names a product, anything else only counts when any product will do.
const ask = (images: string[]) => async (name: string, _store: string, anyProduct: boolean) => (name.startsWith("Acme") || anyProduct ? images : []);

test("image addresses are read from the last JSON line; only public https ones are kept, three at most", () => {
  assert.deepEqual(readImages(`Found it.\n{"images": ["${FRONT}", "${SIDE}"]}\n\nSources: a page`), [FRONT, SIDE]);
  assert.deepEqual(readImages('{"images": []}'), []);
  assert.deepEqual(readImages("no json here"), []);
  assert.deepEqual(readImages('{"images": "front.jpg"}'), []);
  assert.deepEqual(readImages(`{"images": ["http://images.example/a.jpg", "https://localhost/a.jpg", "https://10.0.0.1/a.jpg", "https://[::1]/a.jpg", "https://printer.local/a.jpg", "file:///etc/hosts", 7, "${FRONT}"]}`), [FRONT]);
  assert.equal(readImages(`{"images": ["${FRONT}", "${FRONT}1", "${FRONT}2", "${FRONT}3"]}`).length, 3);
});

test("an item naming a product gets its picture; a generic one gets nothing", async () => {
  const { fetcher } = fakeFetch({ [FRONT]: JPEG });
  const branded = addItem({ name: "Acme marinara" });
  const after = await attachProductPhoto(branded.id, branded.name, { onlyBranded: true }, ask([FRONT]), fetcher);
  assert.notEqual(after!.photo, "");
  assert.equal(getPhoto(branded.id)!.type, "image/jpeg");

  const generic = addItem({ name: "Marinara" });
  assert.equal(await attachProductPhoto(generic.id, generic.name, { onlyBranded: true }, ask([FRONT]), fetcher), undefined);
  assert.equal(getItem(generic.id)!.photo, "");
});

test("an address that is missing or isn't an image is skipped for the next one", async () => {
  const { fetcher, asked } = fakeFetch({ [FRONT]: NOT_AN_IMAGE, [SIDE]: PNG });
  const item = addItem({ name: "Acme pesto" });
  await attachProductPhoto(item.id, item.name, { onlyBranded: true }, ask(["https://images.example/gone.jpg", FRONT, SIDE]), fetcher);
  assert.equal(asked.length, 3);
  assert.equal(getPhoto(item.id)!.type, "image/png");
});

test("asked for by hand, any item gets the best match, replacing its photo", async () => {
  const item = addItem({ name: "Tomato sauce", aisle: "4" });
  setPhoto(item.id, PNG);
  const after = await attachProductPhoto(item.id, item.name, { onlyBranded: false }, ask([FRONT]), fakeFetch({ [FRONT]: JPEG }).fetcher);
  assert.equal(getPhoto(item.id)!.type, "image/jpeg");
  assert.deepEqual([after!.aisle, after!.aisleFrom], ["4", "you"]);
});

test("an automatic lookup keeps a photo the item already has", async () => {
  const item = addItem({ name: "Acme vinegar" });
  setPhoto(item.id, PNG);
  assert.equal(await attachProductPhoto(item.id, item.name, { onlyBranded: true }, ask([FRONT]), fakeFetch({ [FRONT]: JPEG }).fetcher), undefined);
  assert.equal(getPhoto(item.id)!.type, "image/png");
});

test("nothing found, or the search failing, leaves the item alone", async () => {
  const { fetcher } = fakeFetch({});
  const item = addItem({ name: "Acme mustard" });
  assert.equal(await attachProductPhoto(item.id, item.name, { onlyBranded: true }, ask([]), fetcher), undefined);
  assert.equal(await attachProductPhoto(item.id, item.name, { onlyBranded: true }, ask([FRONT]), fetcher), undefined);
  assert.equal(await attachProductPhoto(item.id, item.name, { onlyBranded: true }, async () => { throw new Error("offline"); }, fetcher), undefined);
  assert.equal(getItem(item.id)!.photo, "");
});

test("queued lookups run one at a time, in order", async () => {
  const { fetcher } = fakeFetch({ [FRONT]: JPEG });
  const events: string[] = [];
  const slow = async (name: string) => {
    events.push(`start ${name}`);
    await new Promise((r) => setTimeout(r, 5));
    events.push(`end ${name}`);
    return [FRONT];
  };
  const a = addItem({ name: "Acme jam" }), b = addItem({ name: "Acme honey" });
  await Promise.all([queueProductPhoto(a.id, a.name, slow, fetcher), queueProductPhoto(b.id, b.name, slow, fetcher)]);
  assert.deepEqual(events, ["start Acme jam", "end Acme jam", "start Acme honey", "end Acme honey"]);
  assert.notEqual(getItem(b.id)!.photo, "");
});

test("product photos can be switched off", () => {
  process.env.CAULDRON_PRODUCT_PHOTOS = "off";
  assert.equal(productPhotosEnabled(), false);
  delete process.env.CAULDRON_PRODUCT_PHOTOS;
});
