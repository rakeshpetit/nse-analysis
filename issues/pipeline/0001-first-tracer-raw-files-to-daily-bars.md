---
status: done
type: AFK
blocked_by: []
---

# First tracer: Raw Files → Daily Bars

## What to build

The thinnest path from Raw Files to queryable Daily Bars. Set up the new `pipeline/` TypeScript workspace, a new Postgres database (connection from `DATABASE_URL`), a runner for plain numbered SQL migrations, and `vitest`. Pin Node with asdf.

`load` reads every `sec_bhavdata_full` Raw File under `files/` into Staged Rows: all columns kept as received, plus the source file and line number. Only Trading Days on or after the configured start date (2024-09-01) are in scope. Earlier files are skipped, never deleted.

`build` turns Staged Rows into Daily Bars: one row per symbol per Trading Day, EQ and BE series only, with typed prices and quantities. Series is stored on the bar. Bars are unadjusted.

For this slice, assume one well-formed file per Trading Day. Duplicates and misdated files are handled in #0002.

See GLOSSARY.md and ADR 0001/0002.

## Acceptance criteria

- [x] `pipeline/` is a yarn workspace, and `/packages` is untouched
- [x] Migrations create the `staged` and `core` schemas in a new database
- [x] `load` is safe to re-run: loading the same files twice gives the same Staged Rows
- [x] Every Staged Row can be traced to its Raw File and line
- [x] `build` produces Daily Bars only for EQ/BE and only for Trading Days ≥ the configured start date
- [x] RELIANCE's Daily Bars from Sep 2024 can be queried, and the values match the Raw Files exactly
- [x] A test loads a small fixture file and asserts the resulting Daily Bars

## Blocked by

None - can start immediately

## Implementation notes

- The Raw Files on disk are not `sec_bhavdata_full`; they are the 15-column layout written by `fetchBhavcopy.js`. `load` reads that layout. See `pipeline/README.md`.
- On the real `files/`, `build` stops on a duplicate (symbol, Trading Day): 11 Sunday-named files hold a copy of the previous trading day (e.g. `08DEC2024.csv` is 2024-12-06). That is #0002. With those 11 excluded, 541 RELIANCE bars from 2024-09-02 matched the Raw Files exactly.
- Pre-start files are skipped by the date in the file name, so files in other layouts are never opened. `build` also filters on the date inside the file.
