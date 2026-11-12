---
status: ready
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

- [ ] `pipeline/` is a yarn workspace, and `/packages` is untouched
- [ ] Migrations create the `staged` and `core` schemas in a new database
- [ ] `load` is safe to re-run: loading the same files twice gives the same Staged Rows
- [ ] Every Staged Row can be traced to its Raw File and line
- [ ] `build` produces Daily Bars only for EQ/BE and only for Trading Days ≥ the configured start date
- [ ] RELIANCE's Daily Bars from Sep 2024 can be queried, and the values match the Raw Files exactly
- [ ] A test loads a small fixture file and asserts the resulting Daily Bars

## Blocked by

None - can start immediately
