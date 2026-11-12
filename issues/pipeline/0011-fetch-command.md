---
status: done
type: AFK
blocked_by: ["0002"]
---

# `fetch` command

## What to build

`fetch` brings the raw inputs up to date. It saves exactly what NSE serves and never converts it.

- **Bhavcopies.** For every missing Trading Day from the latest file up to today (IST), download NSE's `sec_bhavdata_full` file and save it verbatim as `files/YYYY/MON/DDMONYYYY.csv`. Days that return no file (holidays) are skipped quietly. Existing files are never overwritten.
- **Reference Snapshots.** Save today's corporate actions (JSON, covering the configured start date up to today), `symbolchange.csv` and `namechange.csv` verbatim under `reference/`, named by date. An existing snapshot for the same day is not overwritten.
- Send a browser-like User-Agent and throttle requests.

The existing `packages/stockdata/fetchBhavcopy.js` (which converts UDiFF) is left as it is.

## Acceptance criteria

- [x] Running `fetch` today fills in 7–12 Nov 2026, and `load`/`build` then pick those days up
- [x] Fetched files are byte-identical to what NSE served
- [x] Re-running `fetch` straight away downloads nothing new and overwrites nothing
- [x] Network failures are reported per day, and one failure doesn't stop the remaining days
- [x] Tests run against a stubbed HTTP layer, never against NSE itself

## Blocked by

- #0002
