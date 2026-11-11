# Cauldron

Diet planner: ingredients, meals, one **base day** with six **versions** (workout/rest × cut/maintain/bulk), nutrient totals vs targets, suggested fixes, kitchen locations.

- **Day**: opens on a version drawn as blocks over the base day's dashed outline (height is calories; click a block to resize, drop or add). The Overview toggle shows all six versions side by side. The Base day tab holds the meals you eat every day (with variations) and the foods you like per meal. Each version is the base plus changes: drop a meal, resize it, add a food. Hover any number to see its main contributors and ask for a fix.
- **Targets**: calorie and macro targets for all three goals from your numbers (ss.fitness calculators), plus which numbers are okay to exceed.
- **Review**: AI proposals and suggested changes wait here until you accept them. A solver does the arithmetic; the AI only maps your words to foods you already have.
AI proposals (USDA lookup, `claude -p` for meals and days) always land as `proposed` and count only once approved.
Everything is dairy-free by default; dairy ingredients are flagged.

## Run
    npm install
    npm run import -- path/to/diet.xlsx   # optional, one-time: reads a diet spreadsheet (read-only) into data/cauldron.db
    npm run dev      # http://127.0.0.1:3100
    npm test

## Config
- `USDA_API_KEY` in `.env.local` (gitignored). Without it `DEMO_KEY` is used (~10 requests/hour).
- `CAULDRON_DB` overrides the database path (default `data/cauldron.db`).
- `CAULDRON_XLSX` is the spreadsheet `npm run import` reads when no path is given (default `data/diet.xlsx`).

## Running on a server
Needs Node 22.5+ (`node:sqlite`) and the `claude` CLI logged in for AI meal/day proposals. Copy `data/cauldron.db`,
run `npm run build && npm start`, and put it under launchd/systemd.
