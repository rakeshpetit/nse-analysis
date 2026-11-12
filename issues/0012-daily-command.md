---
status: ready
type: AFK
blocked_by: ["0003", "0005", "0007", "0010", "0011"]
---

# `daily` command

## What to build

`pipeline daily` runs `fetch` → `load` → `build` → `review` in order and finishes with a short summary:

- new Trading Days loaded
- Corporate Actions applied
- texts waiting for `/interpret-corporate-actions`
- open review items

Every step is safe to re-run. A full rebuild from `files/`, `reference/` and `review/` alone gives the same Adjusted layer. Scheduling it (launchd/cron) is out of scope.

## Acceptance criteria

- [ ] Running `daily` twice in a row leaves the database unchanged after the second run
- [ ] Dropping the database, migrating and running `daily` (with fetch skipped) reproduces the same Adjusted layer
- [ ] The summary tells the user when `/interpret-corporate-actions` or a review pass is needed
- [ ] There is a README in `pipeline/` covering setup, the commands and the review loop

## Blocked by

- #0003
- #0005
- #0007
- #0010
- #0011
