# Cauldron

Diet planner (Next.js, `node:sqlite`). See README.md for how it fits together, how to run it and its config.

- Direction: Cauldron should be a native app that works on desktop (Mac), phone and watch, with the Next.js server as the shared store and API. New features should be reachable from the native apps (`apple/`, SwiftUI), not only the web pages. Only the shopping list is native so far.

- Tests: `npm test` (node's built-in runner over `lib/*.test.ts`). Each test opens its own database file under `data/`, never `data/cauldron.db`.
- The database and anything in `data/` stay out of git.
- This repo is public: tests, fixtures, sample data, docs and comments must be generic, with no personal data (real names, personal media or reading lists, calendars, health, money, machine names).
- Machine-specific and personal notes live in the gitignored `CLAUDE.local.md`.
