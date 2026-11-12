---
status: done
type: AFK
blocked_by: ["0011", "0012"]
---

# Market Cap Files and Issue Size

## What to build

The front-end ranks Securities by Market Cap, but bhavcopies carry no share counts. NSE publishes a daily Market Cap File that does.

- **Fetch.** For each Trading Day from the day this ships forward (no backfill to 2024-09), download `https://nsearchives.nseindia.com/archives/equities/bhavcopy/pr/PR<ddmmyy>.zip` with the headers `fetch` already sends (no cookie needed). Pull out the one member whose name matches `mcap<ddmmyyyy>.csv` case-insensitively (it was `MCAP…` in 2024 and `mcap…` in 2026) and save it byte-for-byte as `files/mcap/YYYY/MON/DDMONYYYY.csv`. Extracting it from the zip is not converting it. If NSE answers with a 404, or with a 200 whose body is not a zip (it serves HTML 404 pages), treat that day as "no file", the same as a bhavcopy holiday. Never overwrite an existing file. Part of `fetch`, and so of `daily`.
- **Load.** Load each Market Cap File's rows as Staged Rows. Values are space-padded, and dates look like `11 NOV 2026`. The last three lines are totals (Symbol `Listed`/`Permitted`/`Total`, blank Series) and are not Securities.
- **Build.** Record Issue Size per Security per Trading Day, for EQ and BE only, resolving symbol to Security the way Daily Bars do.
- **Check.** Our Market Cap is Issue Size × our unadjusted close for that Trading Day. `review` lists every Security-day where it differs from the file's `Market Cap(Rs.)` by more than 0.5%. These items are informational, so no Review Decision is needed.

Header, for reference:

```
Trade Date,Symbol,Series,Security Name,Category,Last Trade Date,Face Value(Rs.),Issue Size,Close Price/Paid up value(Rs.),Market Cap(Rs.)
```

Issue Size is a share count, Market Cap is in plain rupees, and Security Name is ignored for now (see #0022).

## Acceptance criteria

- [ ] `fetch` saves today's Market Cap File verbatim under `files/mcap/`, and re-running it downloads nothing new
- [ ] A 404 and an HTML body with status 200 are both "no file that day", not a failure
- [ ] After `build`, every EQ/BE Security in the latest Market Cap File has an Issue Size for that Trading Day
- [ ] The totals lines and non-EQ/BE series (SM, ST, BZ, IV, RR, …) are not recorded
- [ ] `review` shows Market Cap mismatches over 0.5% as their own section
- [ ] Tests use a stubbed HTTP layer and a fixture zip, never NSE itself

## Blocked by

- #0011
- #0012
