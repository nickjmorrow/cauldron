# Cauldron

<img src="app/icon.svg" width="72" align="right" alt="">

A local-first meal planner for people who eat roughly the same day most days and want it to hit their nutrient targets while cutting or bulking.

You describe one **base day** (the meals you usually eat, with variations), and Cauldron keeps a **version** of it for each goal (cut and bulk), each with one daily target. Each version is the base day plus a few changes: drop a meal, resize it, add a food. Cauldron totals every nutrient against that version's targets and suggests the smallest set of changes that closes the gaps.

## What it does

- **Day planner**: each version is drawn as blocks over the base day's dashed outline (block height is calories); click a meal to see its ingredients, resize it or drop it, or add a food. An overview shows the versions side by side.
- **Nutrient tracking**: totals for 28 nutrients (macros, fats, fiber, vitamins, minerals, caffeine) against targets, with the range a day can swing across its meal variations. Hover any number to see which meals contribute most.
- **Suggested fixes**: a deterministic solver fits a version to its targets by adding liked foods, shrinking meals or dropping them. It never undoes your own choices, respects per-nutrient tolerances, and is capped by hard upper limits (vitamins A, C, D and E, iron, zinc, calcium, caffeine, protein per kg of body weight) that no suggestion can exceed.
- **Targets**: calorie and macro targets for all three goals from your profile, plus which nutrients may run over and by how much.
- **AI proposals with review**: describe what you want in words and the `claude` CLI maps it to ingredient searches, meals, liked foods or kitchen placements. Ingredient nutrients come from USDA FoodData Central. Everything lands as *proposed* and counts only after you approve it on the Review page.
- **Kitchen**: name the places food lives (pantry, fridge shelves, freezer) and see where each ingredient is kept.
- **Recipes**: what you cook, each with its ingredient list (every line as written, plus what to buy for it), free-text sections (instructions, log, storage, notes) and the meals it makes. Meals keep the nutrition; a recipe never feeds totals. A recipe is typical when one of its meals is in the typical day. `npm run import-recipes -- recipes.json` loads recipes from a file (format at the top of `scripts/import-recipes.ts`; re-running replaces recipes of the same name), and `/api/recipes` reads and writes them as JSON.
- **Shopping list**: every item grouped by aisle, with check-off and undo. An item can say what it's for (meals, an occasion, any reason), picked from the reasons used so far or typed in new; added without one, it's for the typical recipes that list it as something to buy. Each reason on the list is a chip above it: switch one off and its items leave this trip, on every client (`PUT /api/shopping/hidden`). To see only one reason's items for a moment, shift+click its chip (Mac app and web page) or long-press it (iPhone): the chip turns solid, the others dim, and nothing is saved or shared with other clients. Shift+click or long-press it again, press Escape, click any chip or "Show all" to go back to what the switches say. The tag beside an item's checkbox opens its reasons, and each tick is saved at once. A tap on a checkbox waits two seconds before it takes effect, so a slip can be tapped back. A new item waits in an Inbox group at the top while its aisle is being found. When an item is added without an aisle, the server asks Claude (the `claude` command, with web search) which aisle it's in at your store and shows it as looking until the answer comes back. Items can carry a photo (of the exact product, say). An item that names a brand gets that product's picture by itself: the server asks Claude to find it on the web. "Find product photo" does the same for any item. An item remembers its aisle and photo the next time it's added; with no aisle known, it goes under a store section guessed from its name (Produce, Dairy & eggs, Pantry and so on, in walking order). A small JSON API (`/api/shopping`) lets other clients, such as a phone or watch app, read and change the same list.

## How it works

```
 browser ──> Next.js App Router (server components + server actions)
                 │
                 ├── lib/queries.ts, lib/resolve.ts ── read and resolve days, versions, meals
                 ├── lib/solver.ts, lib/fixes.ts ───── suggested fixes (pure, deterministic)
                 ├── lib/ai.ts ──> `claude -p` ─────── words -> structured proposals (no arithmetic)
                 ├── lib/usda.ts ──> USDA FoodData Central API
                 └── lib/db.ts ──> node:sqlite (data/cauldron.db)
```

- **One process, one file.** The Next.js server renders every page on the server and writes through server actions straight to a SQLite database via Node's built-in `node:sqlite`. There is no separate API or ORM; the schema and its migrations live in `lib/db.ts`.
- **Arithmetic stays in code.** The AI only turns free text into structured requests over foods you already have. The solver (`lib/solver.ts`) does the maths, and `lib/guardrails.ts` enforces upper limits on anything the solver or a user tolerance could push too high.
- **Human in the loop.** AI output and solver suggestions are stored with status `proposed` and appear on the Review page with a plain-language diff and before/after numbers against targets.
- **Import.** `scripts/import-xlsx.ts` does a one-time, read-only import of a diet spreadsheet (sheets named Foods, Recipes, Meals and Day Comparison) into the database, and refuses to overwrite a database that already has version changes.

## Tech stack

TypeScript, Next.js 16 (App Router, server actions), React 19, SQLite via `node:sqlite`, Node's built-in test runner, ExcelJS (import only), the `claude` CLI (optional, for AI proposals), USDA FoodData Central API.

## Getting started

Requirements:

- Node.js 22.18 or newer (uses the built-in `node:sqlite` module and runs `.ts` files directly with type stripping)
- Optional: the Claude Code CLI (`claude`), logged in, for AI proposals
- Optional: a free [USDA FoodData Central API key](https://fdc.nal.usda.gov/api-key-signup)

```sh
npm install
cp .env.example .env.local   # then fill in USDA_API_KEY
npm run dev                  # http://127.0.0.1:3100
```

The database is created on first run at `data/cauldron.db`. To seed it from a spreadsheet instead of starting empty:

```sh
npm run import -- path/to/diet.xlsx
```

Production build:

```sh
npm run build
npm start                    # http://127.0.0.1:3100
```

Both servers bind to `127.0.0.1` only; there is no authentication, so put it behind a reverse proxy or VPN if you run it on a server.

### Running on a server

`ops/deploy.sh` runs the tests, copies the code to a Mac you can reach over ssh, builds it there and keeps it running under launchd (`com.cauldron.server`, log `~/Library/Logs/cauldron.log`). It also sets up a tailnet-only `tailscale serve` in front of port 3100, so only your own devices can reach it.

```sh
echo 'CAULDRON_DEPLOY_HOST=my-server' >> .env.local
./ops/deploy.sh
```

The script never copies or changes `data/`. To start the server with your existing data, copy `data/cauldron.db` there once, before the first deploy. After that the server's database is the one to use; a second copy edited elsewhere will drift.

It also installs a nightly backup (`ops/backup.sh`, launchd `com.cauldron.backup`, 3:45am, log `~/Library/Logs/cauldron-backup.log`): a dated, self-contained copy of the database plus the shopping photos in `CAULDRON_BACKUP_DIR`, keeping the newest 30. Run it by hand with `./ops/backup.sh`; to restore, stop the server and copy a dated file over `data/cauldron.db`.

### Phone and watch app

Where this is going: Cauldron should be a native app on desktop (Mac), phone and watch, with the server as the shared store. Today only the shopping list is native; the planner pages are still web-only.

`apple/` holds a small native iPhone app with an Apple Watch app inside it, a client for the shopping list API. The phone talks to the server; the watch gets the list from the phone (WatchConnectivity), so it works anywhere the phone can reach the server and shows the last list it had when it can't. Check-offs made while offline are queued and sent later.

```sh
cd apple
cp .env.example .env   # server URL, Apple team ID, bundle ID prefix
./generate.sh          # needs XcodeGen; writes Cauldron.xcodeproj
```

Then open `Cauldron.xcodeproj` and run the `Cauldron` scheme on a phone that has a paired watch.

The `CauldronMac` scheme is the Mac app: a sidebar with the native shopping list (the same sync code as the phone) and the planner pages, which are the server's web pages shown inside the app until they get native screens. Build it with `xcodebuild -scheme CauldronMac -configuration Release` and copy `Cauldron.app` to `/Applications`.

### Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `USDA_API_KEY` | USDA FoodData Central key for ingredient lookups | `DEMO_KEY` (about 10 requests per hour) |
| `CAULDRON_DB` | SQLite database path; shopping photos go in a folder beside it (`data/cauldron-photos/`) | `data/cauldron.db` |
| `CAULDRON_XLSX` | Spreadsheet `npm run import` reads when no path is given | `data/diet.xlsx` |
| `CAULDRON_DEPLOY_HOST` | ssh host `ops/deploy.sh` deploys to | none (required to deploy) |
| `CAULDRON_SERVE_PORT` | Tailnet HTTPS port `ops/deploy.sh` serves on | `8456` |
| `CAULDRON_AISLE_LOOKUP` | `off` turns off store aisle lookups. They run the `claude` command (Claude Code, signed in on the server) with web search, so they need no API key | on when `claude` is installed |
| `CAULDRON_STORE` | The store aisle lookups search for, e.g. `Mariano's, <neighborhood>, <city>` | a typical US grocery store |
| `CAULDRON_PRODUCT_PHOTOS` | `off` turns off product photos. They run the `claude` command with web search, like aisle lookups | on when `claude` is installed |
| `CAULDRON_BACKUP_DIR` | Where `ops/backup.sh` writes the nightly copies | `~/CauldronBackups` |

Next.js reads these from `.env.local`. The import script is plain Node, so pass variables inline there, for example `CAULDRON_DB=data/other.db npm run import -- diet.xlsx`.

## Tests

```sh
npm test
```

Runs Node's built-in test runner over `lib/*.test.ts`: 134 tests across 21 files covering the solver, fixes and proposals, guardrails and tolerances, nutrient totals and contributors, version resolution, day-variation spread, the target calculators, schema migrations and the spreadsheet importer. Each test file uses its own database under `data/`, never `data/cauldron.db`.

## Project layout

```
app/                  Next.js routes, server actions and UI
  days/[id]/          day planner: version blocks, overview, base day, nutrient tables
  meals/ ingredients/ kitchen/ shopping/ targets/ review/
  api/shopping/       JSON API for the shopping list
  actions.ts          every server action (writes)
lib/                  domain logic and data access, with tests alongside (*.test.ts)
  db.ts               schema, migrations, SQLite connection
  solver.ts fixes.ts  suggested fixes
  ai.ts usda.ts       AI proposals and USDA lookups
  recipes.ts          recipes: storage, input checks, which recipes a shopping item is for
  shopping.ts         shopping list: grouping by aisle, input checks, storage
  sections.ts         store sections guessed from an item's name, in walking order
apple/                iPhone and Apple Watch client for the shopping list (SwiftUI, XcodeGen)
scripts/
  import-xlsx.ts      one-time spreadsheet import
CLAUDE.md             notes for AI coding assistants working in this repo
```

## License

See [LICENSE](LICENSE).
