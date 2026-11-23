// Product photos from the store's own catalog, through the Kroger Products API (Kroger and its sister chains).
// An item that names a product ("<brand> marinara") gets that product's picture as its photo; the same answer
// carries the aisle at your store, which replaces a guessed one.
// Needs a free developer account (developer.kroger.com): KROGER_CLIENT_ID, KROGER_CLIENT_SECRET, and
// KROGER_LOCATION_ID (your store's 8-digit id from the Locations API). With any of them missing, this is off.
import { getDb } from "./db.ts";
import { getItem, setPhoto, type ShoppingItem } from "./shopping.ts";

const API = "https://api.kroger.com/v1";
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_TERM_WORDS = 8; // the API's limit on a search term
const MIN_TERM_LENGTH = 3; // likewise
const RESULTS = 10;
const TOKEN_MARGIN_MS = 60_000;
// Preferred first: big enough to read a label, small enough for a phone.
const IMAGE_SIZES = ["large", "xlarge", "medium"];
// First words of brand names that are also ordinary words, so "fresh basil" isn't taken to name a brand.
const ORDINARY_WORDS = new Set(["fresh", "simple", "simply", "organic", "natural", "good", "great", "best", "big", "little", "old", "new", "green", "blue", "red", "golden", "sweet", "pure", "real", "whole"]);

const config = () => ({
  id: process.env.KROGER_CLIENT_ID?.trim() ?? "",
  secret: process.env.KROGER_CLIENT_SECRET?.trim() ?? "",
  location: process.env.KROGER_LOCATION_ID?.trim() ?? "",
});
export const krogerEnabled = () => Object.values(config()).every(Boolean);

// imageUrl: the front-of-pack picture, "" when the product has none. aisle: its numbered aisle at the store, "" when not given.
export type Product = { brand: string; description: string; imageUrl: string; aisle: string };

type RawImage = { perspective?: unknown; featured?: unknown; sizes?: { size?: unknown; url?: unknown }[] };
type RawProduct = { brand?: unknown; description?: unknown; images?: RawImage[]; aisleLocations?: { number?: unknown }[] };

function imageUrl(images: RawImage[] = []): string {
  const image = images.find((i) => i.perspective === "front") ?? images.find((i) => i.featured === true) ?? images[0];
  const sizes = image?.sizes ?? [];
  const best = IMAGE_SIZES.map((name) => sizes.find((s) => s.size === name)).find(Boolean) ?? sizes[0];
  return typeof best?.url === "string" ? best.url : "";
}

function aisleNumber(locations: { number?: unknown }[] = []): string {
  const number = String(locations[0]?.number ?? "").trim();
  return /^\d{1,3}$/.test(number) && Number(number) > 0 ? String(Number(number)) : "";
}

// The products in a search answer, in the order given.
export function readProducts(json: unknown): Product[] {
  const data = (json as { data?: unknown } | null)?.data;
  if (!Array.isArray(data)) return [];
  return (data as RawProduct[]).map((p) => ({
    brand: typeof p.brand === "string" ? p.brand : "",
    description: typeof p.description === "string" ? p.description : "",
    imageUrl: imageUrl(Array.isArray(p.images) ? p.images : []),
    aisle: aisleNumber(Array.isArray(p.aisleLocations) ? p.aisleLocations : []),
  }));
}

const words = (text: string) => text.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);

// Whether an item's name names this brand: the whole brand appears in it, or it starts with the brand's first word
// ("<Brand> marinara" for the brand "<Brand> Homemade") and that word isn't an ordinary one.
export function namesBrand(name: string, brand: string): boolean {
  const nameWords = words(name), brandWords = words(brand);
  if (brandWords.length === 0) return false;
  if (` ${nameWords.join(" ")} `.includes(` ${brandWords.join(" ")} `)) return true;
  return brandWords.length > 1 && nameWords[0] === brandWords[0] && brandWords[0].length >= MIN_TERM_LENGTH && !ORDINARY_WORDS.has(brandWords[0]);
}

let token: { value: string; expires: number } | undefined;

async function getToken(fetcher: typeof fetch): Promise<string> {
  if (token && token.expires > Date.now()) return token.value;
  const { id, secret } = config();
  const response = await fetcher(`${API}/connect/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}` },
    body: "grant_type=client_credentials&scope=product.compact",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Kroger refused the sign-in (HTTP ${response.status}).`);
  const reply = (await response.json()) as { access_token: string; expires_in: number };
  token = { value: reply.access_token, expires: Date.now() + reply.expires_in * 1000 - TOKEN_MARGIN_MS };
  return token.value;
}

// The store's products matching an item's name, best match first.
export async function searchProducts(name: string, fetcher: typeof fetch = fetch): Promise<Product[]> {
  const term = name.trim().split(/\s+/).slice(0, MAX_TERM_WORDS).join(" ");
  if (term.length < MIN_TERM_LENGTH) return [];
  const query = new URLSearchParams({ "filter.term": term, "filter.locationId": config().location, "filter.limit": String(RESULTS) });
  const response = await fetcher(`${API}/products?${query}`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${await getToken(fetcher)}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  // A token turned down early is dropped, so the next search signs in again.
  if (response.status === 401) token = undefined;
  if (!response.ok) throw new Error(`Kroger product search failed (HTTP ${response.status}).`);
  return readProducts(await response.json());
}

// The catalog's aisle replaces one that was guessed or placed by a lookup, never one typed or remembered.
function setStoreAisle(id: number, aisle: string): void {
  getDb().prepare("UPDATE shopping_items SET aisle = ?, aisle_from = 'store', lookup = 0 WHERE id = ? AND aisle_from IN ('guess', 'store', '')").run(aisle, id);
}

// Gives an item the picture of the product it names. With onlyBranded (the automatic case) only a product whose brand
// is in the item's name counts, and a photo the item already has is kept; otherwise the best match replaces it.
// Returns the changed item, or undefined when nothing was attached. Never throws.
export async function attachProductPhoto(id: number, name: string, { onlyBranded }: { onlyBranded: boolean }, fetcher: typeof fetch = fetch): Promise<ShoppingItem | undefined> {
  try {
    const products = (await searchProducts(name, fetcher)).filter((p) => p.imageUrl);
    const product = onlyBranded ? products.find((p) => namesBrand(name, p.brand)) : products[0];
    if (!product) return undefined;
    const response = await fetcher(product.imageUrl, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw new Error(`the image could not be fetched (HTTP ${response.status}).`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    // Checked after the download, so a photo added by hand meanwhile wins.
    const item = getItem(id);
    if (!item || (onlyBranded && item.photo)) return undefined;
    const saved = setPhoto(id, bytes);
    if (!saved || "error" in saved) return undefined;
    if (product.aisle) setStoreAisle(id, product.aisle);
    return getItem(id);
  } catch (error) {
    console.error(`product photo for "${name}" failed:`, error instanceof Error ? error.message : error);
    return undefined;
  }
}
