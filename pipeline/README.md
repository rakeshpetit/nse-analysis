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
| `yarn build`   | `staged.bhavcopy_row` → `core.daily_bar` (EQ/BE only, typed, unadjusted) plus `core.daily_bar_flag` (Quality Flags), then `adjusted.*` from Daily Bars and Corporate Actions. All rebuilt from scratch. Fails if Raw Files disagree on a Trading Day; lists Corporate Actions it had to skip. |
| `yarn review`  | Lists every open review item from the last `build` (see "Review queue"). Read-only.                |
| `yarn test`    | vitest. Needs a local Postgres; each test file creates and drops its own database.                 |
| `yarn typecheck` |                                                                                                  |

`FILES_DIR` overrides the Raw Files location (default: `../files`).
`REFERENCE_DIR` overrides the reference location (default: `../reference`).
`TEST_ADMIN_URL` overrides the database used to create test databases
(default `postgres://localhost/postgres`).

## Raw File layout

ADR 0002 describes the in-scope files as NSE's `sec_bhavdata_full` layout. The
files actually on disk from 2024-09-01 on are the 15-column layout written by
`packages/stockdata/fetchBhavcopy.js` (`SYMBOL, SERIES, DATE1, PREV_CLOSE, …,
DELIV_PER`), with values padded by a leading space and `-` or blank for
missing values. `load` reads that layout and rejects any other header.

## Messy Raw Files

- The Trading Day is the date inside the file; the file name is ignored. About 11
  files are misdated (e.g. `08SEP2024.csv` is a copy of `06SEP2024.csv`,
  `02OCT2024.csv` holds 1-Oct data).
- `load` stages every file as received, so duplicates sit side by side in
  `staged.bhavcopy_row`. `build` collapses files that agree on a (symbol, series,
  Trading Day) into one Daily Bar.
- If two files claim the same Trading Day and differ on any row they share,
  `build` fails, naming both files and lines and the columns that differ. Nothing
  in `core.daily_bar` changes. Fix it by removing or correcting the bad file's
  source, never by editing a Raw File.
- Both quoting styles (`" SERIES"` and unquoted ` SERIES`) load the same.

## Quality Flags

`build` attaches flags to implausible Daily Bars in `core.daily_bar_flag`
(one row per bar and flag; a bar can carry several). Flagged bars are kept and
never corrected; analyses choose whether to exclude them.

| Flag                     | Raised when                                                        |
| ------------------------ | ------------------------------------------------------------------ |
| `high_below_low`         | high < low                                                         |
| `open_outside_range`     | open is outside low–high (only checked when high >= low)          |
| `close_outside_range`    | close is outside low–high (only checked when high >= low)         |
| `last_outside_range`     | last is outside low–high (only checked when high >= low)           |
| `zero_qty_nonzero_price` | traded quantity is 0 but some price is non-zero                    |

```sql
SELECT * FROM core.quality_flag_count;   -- bars per flag name, across all bars
```

`prev_close_mismatch` is raised in the later step of `build`, once Adjustment Factors are
known: a bar whose prev close is not the previous Daily Bar's close (more than 0.005 apart).
NSE never adjusts prev close on ex-dates, so a bar whose gap from the previous bar contains
the ex-date of an applied, price-changing action is allowed to differ. The first bar of a
Security is never flagged. `adjusted.daily_bar_flag` is a view of the same flags, since
they describe the bar as traded.

## Adjusted layer

`build` also fills `adjusted.daily_bar` (same keys as `core.daily_bar`), derived
from Daily Bars and Adjustment Factors. Nothing ever UPDATEs Daily Bars or Raw
Files (ADR 0001).

Inputs live under `reference/` (git-tracked, never edited by the pipeline):

- `corporate-actions/*.json`: verbatim NSE corporate-actions API responses (a JSON
  array with `symbol`, `subject`, `exDate`). The newest file by name is used, e.g.
  `2025-09-01.json`; save one by hand until `fetch` exists (#0011). Only ex-dates
  on/after the start date matter. An action NSE lists twice counts once.
- `action-interpretations.csv`: one row per exact `subject` text, with columns
  `description,type,ratio,old_face_value,new_face_value,issue_price`.
  `type` is `bonus` (`ratio` `a:b`), `split` or `consolidation` (old/new face
  value), or `not_price_relevant`. `rights` and `demerger` rows are accepted but
  not adjusted yet (#0008, #0009), so they are reported as skipped.

| Action                 | Adjustment Factor                        |
| ---------------------- | ---------------------------------------- |
| Split / consolidation  | old face value ÷ new face value          |
| Bonus a:b              | (a+b) ÷ b                                |
| Same ex-date           | factors multiply                         |

Bars strictly before the ex-date are adjusted (a non-Trading-Day ex-date works the
same way). Prices (incl. prev close, average price) are divided by the cumulative
factor of all later ex-dates; traded and delivery quantities are multiplied;
turnover, trades and delivery % are unchanged. Values keep full precision.

A Corporate Action with no interpretation row is never guessed: `build` prints it
(`Skipped N Corporate Action(s)`) and applies no adjustment for it.

### Interpreting new descriptions

`build` never calls an LLM or the network (ADR 0003). Descriptions with no row in
`action-interpretations.csv` are written to `reference/pending-interpretations.txt`
(one per line, git-ignored, removed when nothing is pending) and `build` warns
`N texts need interpreting`. Run the project skill `/interpret-corporate-actions` in
Claude Code: it appends one row per description (fields and an example per type are in
`.claude/skills/interpret-corporate-actions/SKILL.md`), then you review the diff of
`reference/action-interpretations.csv` and commit it.

`build` also checks each row's shape: a known `type`, positive `a:b` ratios and
face/issue values, the fields that type requires (bonus: `ratio`; split/consolidation:
both face values, lowered/raised respectively; rights: `ratio` and `issue_price`).
A row with the wrong shape is not applied, is printed as `Rejected ... Action
Interpretation(s)`, and is returned as `rejectedInterpretations` and listed by `yarn review`.

```sql
SELECT trade_date, close, factor FROM adjusted.daily_bar WHERE symbol = 'RELIANCE' ORDER BY trade_date;
SELECT * FROM adjusted.adjustment_factor ORDER BY symbol, ex_date;
```

## Review queue

`build` also looks for leads to review, in `adjusted.suspected_break` and
`adjusted.action_without_jump`; `yarn review` prints them with the other open items.
Nothing here changes prices; Review Decisions (#0007) are how a person rules on an item.

- **Suspected Break**: after applying every Adjustment Factor, the open or close is more than
  the jump threshold (20% by default, up or down; `JUMP_THRESHOLD` env, `build`'s `jumpThreshold`
  option, or `JUMP_THRESHOLD` in `src/config.ts`) away from the previous Daily Bar's close.
  Reported on the later day.
- **Action with no visible jump**: an applied action that changes prices (factor other than 1)
  where, on unadjusted bars, the first bar on/after the ex-date shows no jump of about that
  factor: neither (previous close ÷ open) nor (previous close ÷ close) is within the jump
  threshold (20%) of the factor, relative to the factor. Small factors therefore pass easily.
  Actions with no bar on one side of the ex-date are not reported.
- **No interpretation** / **rejected interpretation**: from #0005.

Each item has an ID built only from what it is about, so it survives rebuilds:
`break:SYMBOL:DATE`, `no-jump:SYMBOL:EX_DATE`, `no-interpretation:<hash>` and
`rejected-interpretation:<hash>` (first 10 hex of the SHA-1 of the exact description).
Each shows the unadjusted and adjusted prices two bars before and after the date.

## Queries

```sql
SELECT trade_date, series, open, high, low, close, traded_qty
FROM core.daily_bar WHERE symbol = 'RELIANCE' ORDER BY trade_date;
```

Every Staged Row traces to its source: `source_file` (relative to `files/`) and
`line_number` (1-based, header is line 1).
