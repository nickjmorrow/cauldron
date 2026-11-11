# Cauldron

<img src="app/icon.svg" width="72" align="right" alt="">

A local-first meal planner for people who eat roughly the same day most days and want it to hit their nutrient targets on training days, rest days, and while cutting, maintaining or bulking.

You describe one **base day** (the meals you usually eat, with variations), and Cauldron keeps six **versions** of it (workout/rest x cut/maintain/bulk). Each version is the base day plus a few changes: drop a meal, resize it, add a food. Cauldron totals every nutrient against that version's targets and suggests the smallest set of changes that closes the gaps.

## What it does

- **Day planner**: each version is drawn as blocks over the base day's dashed outline (block height is calories); click a block to resize, drop or add. An overview shows all six versions side by side.
- **Nutrient tracking**: totals for 28 nutrients (macros, fats, fiber, vitamins, minerals, caffeine) against targets, with the range a day can swing across its meal variations. Hover any number to see which meals contribute most.
- **Suggested fixes**: a deterministic solver fits a version to its targets by adding liked foods, shrinking meals or dropping them. It never undoes your own choices, respects per-nutrient tolerances, and is capped by hard upper limits (vitamins A, C, D and E, iron, zinc, calcium, caffeine, protein per kg of body weight) that no suggestion can exceed.
- **Targets**: calorie and macro targets for all three goals from your profile, plus which nutrients may run over and by how much.
- **AI proposals with review**: describe what you want in words and the `claude` CLI maps it to ingredient searches, meals, liked foods or kitchen placements. Ingredient nutrients come from USDA FoodData Central. Everything lands as *proposed* and counts only after you approve it on the Review page.
- **Kitchen**: name the places food lives (pantry, fridge shelves, freezer) and see where each ingredient is kept.
- **Dairy-free by default**: dairy ingredients are detected and flagged, and neither the solver nor the AI ever suggests them.

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

### Configuration

| Variable | Purpose | Default |
| --- | --- | --- |
| `USDA_API_KEY` | USDA FoodData Central key for ingredient lookups | `DEMO_KEY` (about 10 requests per hour) |
| `CAULDRON_DB` | SQLite database path | `data/cauldron.db` |
| `CAULDRON_XLSX` | Spreadsheet `npm run import` reads when no path is given | `data/diet.xlsx` |

Next.js reads these from `.env.local`. The import script is plain Node, so pass variables inline there, for example `CAULDRON_DB=data/other.db npm run import -- diet.xlsx`.

## Tests

```sh
npm test
```

Runs Node's built-in test runner over `lib/*.test.ts`: 134 tests across 20 files covering the solver, fixes and proposals, guardrails and tolerances, nutrient totals and contributors, version resolution, day-variation spread, the target calculators, schema migrations and the spreadsheet importer. Each test file uses its own database under `data/`, never `data/cauldron.db`.

## Project layout

```
app/                  Next.js routes, server actions and UI
  days/[id]/          day planner: version blocks, overview, base day, nutrient tables
  meals/ ingredients/ kitchen/ targets/ review/
  actions.ts          every server action (writes)
lib/                  domain logic and data access, with tests alongside (*.test.ts)
  db.ts               schema, migrations, SQLite connection
  solver.ts fixes.ts  suggested fixes
  ai.ts usda.ts       AI proposals and USDA lookups
scripts/
  import-xlsx.ts      one-time spreadsheet import
CLAUDE.md             notes for AI coding assistants working in this repo
```

## License

See [LICENSE](LICENSE).
