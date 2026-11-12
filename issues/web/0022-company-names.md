---
status: done
type: AFK
blocked_by: ["0019"]
---

# Company names on the list and chart pages

## What to build

The list and company pages show only symbols. The Market Cap File's Security Name is upper-case and cut to 25 characters (`AARADHYA DISPOSAL INDUS L`), so it isn't used. NSE's `EQUITY_L.csv` (`https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv`) has full names.

- **Pipeline.** `fetch` saves `EQUITY_L.csv` verbatim as a new Reference Snapshot under `reference/`, named by date. `build` records each Security's current name from the newest snapshot.
- **Web.** The list page gets a name column, and the company page shows the name as its heading. Where no name is known, the symbol is shown.

## Acceptance criteria

- [x] `fetch` saves `EQUITY_L.csv` byte-for-byte and does not overwrite a snapshot from the same day
- [x] The top 30 all show full names
- [x] A Security with no name in the snapshot falls back to its symbol

## Blocked by

- #0019
