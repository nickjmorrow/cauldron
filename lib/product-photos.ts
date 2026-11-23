// Product photos found on the web: an item that names a product ("<brand> marinara") gets that product's picture as
// its photo. The `claude` command (Claude Code, signed in on the server; no API key) searches the web for it, the same
// way lib/aisles.ts places items. CAULDRON_PRODUCT_PHOTOS=off turns this off; CAULDRON_STORE names the store.
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { getItem, setPhoto, type ShoppingItem } from "./shopping.ts";

const run = promisify(execFile);
const SEARCH_TIMEOUT_MS = 120_000;
const DOWNLOAD_TIMEOUT_MS = 15_000;
const MAX_IMAGES = 3;

let hasClaude: boolean | undefined;
export const productPhotosEnabled = () => {
  if (process.env.CAULDRON_PRODUCT_PHOTOS === "off") return false;
  if (hasClaude === undefined) {
    try { execFileSync("claude", ["--version"], { stdio: "ignore", timeout: 10_000 }); hasClaude = true; } catch { hasClaude = false; }
  }
  return hasClaude;
};
const store = () => process.env.CAULDRON_STORE?.trim() || "a typical US grocery store";

// Addresses of pictures of the product, best first; none when the name doesn't name a product (unless anyProduct).
export type AskImages = (name: string, store: string, anyProduct: boolean) => Promise<string[]>;

// The address comes from the web, so only a public https one is fetched: never this machine or one on its network.
function isPublicImageUrl(text: string): boolean {
  let url: URL;
  try { url = new URL(text); } catch { return false; }
  const host = url.hostname;
  return url.protocol === "https:" && host.includes(".") && !/^[\d.]+$/.test(host) && !host.includes(":") && !host.endsWith(".local");
}

// Pulls {"images": [...]} out of the model's last text, keeping only addresses that are safe to fetch.
export function readImages(text: string): string[] {
  const match = text.match(/\{[^{}]*"images"[^{}]*\}/g)?.at(-1);
  if (!match) return [];
  let images: unknown;
  try { images = (JSON.parse(match) as { images?: unknown }).images; } catch { return []; }
  if (!Array.isArray(images)) return [];
  return images.filter((i): i is string => typeof i === "string" && isPublicImageUrl(i)).slice(0, MAX_IMAGES);
}

const prompt = (name: string, where: string, anyProduct: boolean) => `Find a picture of the grocery product "${name}" as sold at ${where}.

- ${anyProduct
    ? "If the name doesn't name a brand, pick the product of that kind most people would buy there."
    : 'If the name does not name a specific brand or product (plain "celery" or "eggs"), answer {"images": []} at once, without searching.'}
- Search the web for the product and give up to ${MAX_IMAGES} direct image addresses (https, a JPEG, PNG or WebP file showing the front of the pack), best first.
- At Kroger and its sister stores, a product page's address ends in a 13-digit id, and its picture is https://www.kroger.com/product/images/large/front/<that id>. Prefer that when you find the id.
- Never invent an address or an id: use only ones you saw in a search result or on a page.

Reply with only one line of JSON: {"images": ["<address>", ...]}`;

export const askClaude: AskImages = async (name, where, anyProduct) => {
  const { stdout } = await run(
    "claude",
    ["-p", prompt(name, where, anyProduct), "--output-format", "json", "--allowedTools", "WebSearch", "WebFetch", "--strict-mcp-config",
      "--disable-slash-commands", "--setting-sources", "", "--no-session-persistence", "--model", "sonnet"],
    { cwd: "data", maxBuffer: 10 * 1024 * 1024, timeout: SEARCH_TIMEOUT_MS },
  );
  const reply = JSON.parse(stdout) as { result: string; is_error: boolean };
  if (reply.is_error) throw new Error(`claude failed: ${reply.result}`);
  return readImages(reply.result);
};

// Gives an item the picture of the product it names. With onlyBranded (the automatic case) a name with no brand gets
// nothing and a photo the item already has is kept; otherwise the best match replaces it.
// Returns the changed item, or undefined when nothing was attached. Never throws.
export async function attachProductPhoto(
  id: number, name: string, { onlyBranded }: { onlyBranded: boolean }, ask: AskImages = askClaude, fetcher: typeof fetch = fetch,
): Promise<ShoppingItem | undefined> {
  try {
    for (const url of await ask(name, store(), !onlyBranded)) {
      const response = await fetcher(url, { redirect: "error", signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) }).catch(() => undefined);
      if (!response?.ok) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      // Checked after the search, so a photo added by hand meanwhile wins.
      const item = getItem(id);
      if (!item || (onlyBranded && item.photo)) return undefined;
      const saved = setPhoto(id, bytes);
      if (saved && !("error" in saved)) return saved;
    }
  } catch (error) {
    console.error(`product photo for "${name}" failed:`, error instanceof Error ? error.message : error);
  }
  return undefined;
}

let queue: Promise<unknown> = Promise.resolve();

// The automatic lookup for a newly added item, one at a time in the background so a burst of new items doesn't start a search each at once.
export function queueProductPhoto(id: number, name: string, ask: AskImages = askClaude, fetcher: typeof fetch = fetch): Promise<ShoppingItem | undefined> {
  const next = queue.then(() => attachProductPhoto(id, name, { onlyBranded: true }, ask, fetcher));
  queue = next;
  return next;
}
