---
status: done
type: AFK
blocked_by: ["0004"]
---

# Securities and renames

## What to build

Give each Security a stable identity that survives symbol changes.

- Load a `symbolchange.csv` Reference Snapshot from NSE, kept verbatim. Its quirks: it isn't sorted, some values have leading spaces, and dates are dd-MON-yyyy.
- Every symbol that appears in an EQ/BE Daily Bar in the window belongs to a Security with a stable ID that isn't the symbol. Each Security has a dated history of its symbols.
- A rename inside the window joins the old and new symbols into one Security, so its Daily Bars, Adjusted series, Corporate Actions (listed under either symbol) and Suspected Break detection are all continuous.
- Series is never part of identity, so a move between EQ and BE stays the same Security.
- Corporate Actions for symbols with no EQ/BE Daily Bars are ignored.

## Acceptance criteria

- [x] Fixture test: a real rename in the window gives one Security with a continuous Adjusted series
- [x] A Corporate Action listed under the old symbol, with an ex-date after the rename, still attaches to the Security
- [x] A fixture of a symbol moving between EQ and BE stays a single Security
- [x] No false Suspected Break appears at the rename date

## Blocked by

- #0004
