# NSE data pipeline

Turns the Raw Files under `files/` into queryable Daily Bars in Postgres. See
[GLOSSARY.md](../GLOSSARY.md), [docs/adr](../docs/adr) and [issues](../issues).
The older `packages/stockdata` code is untouched.

## Setup

```sh
asdf install                      # Node pinned in .tool-versions
yarn install                      # from the repo root
createdb nse_pipeline
export DATABASE_URL=postgres://localhost/nse_pipeline
```

## Commands

Run from `pipeline/`:

| Command        | What it does                                                                                       |
| -------------- | -------------------------------------------------------------------------------------------------- |
| `yarn migrate` | Applies `migrations/NNNN_*.sql` in order; already-applied files are skipped.                       |
| `yarn load`    | Raw Files dated on/after the start date (2024-09-01) → `staged.bhavcopy_row`. Safe to re-run.      |
| `yarn build`   | `staged.bhavcopy_row` → `core.daily_bar` (EQ/BE only, typed, unadjusted). Rebuilt from scratch.    |
| `yarn test`    | vitest. Needs a local Postgres; each test file creates and drops its own database.                 |
| `yarn typecheck` |                                                                                                  |

`FILES_DIR` overrides the Raw Files location (default: `../files`).
`TEST_ADMIN_URL` overrides the database used to create test databases
(default `postgres://localhost/postgres`).

## Raw File layout

ADR 0002 describes the in-scope files as NSE's `sec_bhavdata_full` layout. The
files actually on disk from 2024-09-01 on are the 15-column layout written by
`packages/stockdata/fetchBhavcopy.js` (`SYMBOL, SERIES, DATE1, PREV_CLOSE, …,
DELIV_PER`), with values padded by a leading space and `-` or blank for
missing values. `load` reads that layout and rejects any other header.

## Queries

```sql
SELECT trade_date, series, open, high, low, close, traded_qty
FROM core.daily_bar WHERE symbol = 'RELIANCE' ORDER BY trade_date;
```

Every Staged Row traces to its source: `source_file` (relative to `files/`) and
`line_number` (1-based, header is line 1).
