---
status: done
type: AFK
blocked_by: ["0001"]
---

# Messy Raw Files: in-file Trading Day, duplicates, quoting variant

## What to build

Make loading robust to the actual state of `files/` from Sep 2024 onwards:

- **Trading Day comes from the date inside the file**, not from the file name. About 11 files in the window are misdated. For example `08SEP2024.csv` is byte-identical to `06SEP2024.csv`, and `02OCT2024.csv` holds 1-Oct data.
- **Duplicates collapse.** When several Raw Files claim the same Trading Day and agree on every overlapping row, one Daily Bar results per symbol.
- **Conflicts stop the load.** When files claiming the same Trading Day disagree, the load fails and reports both files and the rows that differ.
- **Quoting variant.** `04SEP2024.csv` has the same columns with unquoted, space-padded values and must load like the rest.

## Acceptance criteria

- [x] Daily Bars are keyed by the in-file Trading Day
- [x] A fixture with a holiday-named duplicate gives one set of Daily Bars
- [x] A fixture with two disagreeing files for the same Trading Day fails with a report naming both files
- [x] The `04SEP2024` quoting variant loads correctly, with a fixture test
- [x] A full load of `files/` from Sep 2024 has no duplicate (symbol, Trading Day) Daily Bars

## Blocked by

- #0001
