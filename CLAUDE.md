# Cauldron

Diet planner (Next.js, `node:sqlite`). See README.md for how it fits together, how to run it and its config.

- Tests: `npm test` (node's built-in runner over `lib/*.test.ts`). Each test opens its own database file under `data/`, never `data/cauldron.db`.
- The database and anything in `data/` stay out of git.
- This repo is public: tests, fixtures, sample data, docs and comments must be generic, with no personal data (real names, personal media or reading lists, calendars, health, money, machine names).
- Machine-specific and personal notes live in the gitignored `CLAUDE.local.md`.
