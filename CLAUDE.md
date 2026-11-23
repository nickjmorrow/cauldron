# Cauldron

Diet planner (Next.js, `node:sqlite`). See README.md for how it fits together, how to run it and its config.

- Direction: Cauldron should be a native app that works on desktop (Mac), phone and watch, with the Next.js server as the shared store and API. New features should be reachable from the native apps (`apple/`, SwiftUI), not only the web pages. Only the shopping list is native so far; on the Mac the planner pages are the server's web pages inside the app.
- Shopping items are always grouped by aisle (numbered aisles, then store sections in walking order, from `lib/sections.ts` when no aisle is known), with an "Inbox" group first for items whose aisle is still being found, on every client. Which items show is decided by the reasons switched off (`hidden` in the API; the rule is `isShown` in `lib/shopping.ts`, mirrored in `apple/Shared/Reasons.swift`).
- Colours come from the app icon's fire plate (oxblood, cream, brass, vermilion), defined once in `app/globals.css` and mirrored in `apple/Shared/Theme.swift`. Checkboxes are square.

- Tests: `npm test` (node's built-in runner over `lib/*.test.ts`). Each test opens its own database file under `data/`, never `data/cauldron.db`.
- The database and anything in `data/` stay out of git.
- This repo is public: tests, fixtures, sample data, docs and comments must be generic, with no personal data (real names, personal media or reading lists, calendars, health, money, machine names).
- Machine-specific and personal notes live in the gitignored `CLAUDE.local.md`.
