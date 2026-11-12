---
status: ready
type: AFK
blocked_by: ["0018"]
---

# Scaffold `web/` and the Top 30 Securities list

## What to build

A new front-end in `web/`, a yarn workspace next to `pipeline`, with nothing imported from `packages/`. The shape is in [ADR 0004](../../docs/adr/0004-web-reads-pipeline-tables-directly.md).

- **Stack.** React Router v7 in framework mode, `pg` with hand-written SQL, plain CSS modules, and the Node version from `.tool-versions`. `DATABASE_URL` points at the pipeline's database.
- **Data access.** One module owns every query. It opens connections with `default_transaction_read_only=on`, so any write fails.
- **List page (`/`).** Titled "Top 30 Securities". It shows the 30 Securities with the highest Market Cap on the latest Trading Day:
  - Only Securities with a Daily Bar on that day are ranked.
  - Market Cap = the Security's most recent Issue Size on or before that day × that day's unadjusted close.
  - Columns: rank, symbol, Market Cap in ₹ crore with Indian grouping (`18,07,135 Cr`), latest close, and 1-day % change (Adjusted close vs previous close).
  - Sorted by Market Cap, with no other sorting or search.
  - Each whole row links to `/companies/:symbol`.
- **Empty state.** With no Issue Size data yet, the page says "No Issue Size data yet. Run `yarn fetch` and `yarn build`" instead of a list.

## Acceptance criteria

- [ ] `yarn dev` in `web/` shows the 30 largest Securities by Market Cap from the local `nse_pipeline` database
- [ ] A Security missing from the latest Market Cap File is still ranked, using its most recent earlier Issue Size
- [ ] A Security with no Daily Bar on the latest Trading Day is not ranked
- [ ] An attempted write through the data-access module fails
- [ ] Data-access tests (vitest, against a real Postgres migrated with the pipeline's migrations, one database per test file) cover the ranking, the Issue Size carry-forward and the empty state
- [ ] A `web/README.md` covers setup and commands

## Blocked by

- #0018
