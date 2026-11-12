---
status: ready
type: AFK
blocked_by: ["0001"]
---

# First adjusted series: bonus, split, consolidation

## What to build

The first end-to-end path from Corporate Actions to Adjusted Prices.

- **Reference Snapshot.** Load a saved corporate-actions JSON snapshot (from NSE's corporate-actions API) from `reference/corporate-actions/`, kept verbatim and never edited. The latest snapshot is the one used. Only ex-dates in the pipeline window matter. Fetching new snapshots is #0011; for now a snapshot can be saved by hand.
- **Action Interpretations.** Read the git-tracked `reference/action-interpretations.csv`, keyed by each Corporate Action's exact description text. Fields: type, ratio, old/new face value, issue price, or "not price-relevant". Seed it by hand for the fixture cases. Generating it with Claude Code is #0005.
- **Adjustment Factors.** These are the amounts prices are divided by:
  - Split: old face value ÷ new face value
  - Bonus a:b: (a+b) ÷ b
  - Consolidation: the inverse of a split
  - Several actions on the same ex-date multiply together.
- **Adjusted layer.** Rebuilt from scratch on every `build` from Daily Bars and Adjustment Factors (ADR 0001):
  - Factors apply to bars strictly before the ex-date. If the ex-date isn't a Trading Day for that symbol, they apply from the first Trading Day after it.
  - Open, high, low, close, last, prev close and average price are divided by the factor. Traded and delivery quantities are multiplied by it. Turnover, number of trades and delivery % are unchanged.
  - Values are kept at full precision.
  - Missing days stay missing.

## Acceptance criteria

- [ ] An `adjusted` schema exists, and its contents are fully rebuilt on each `build`
- [ ] No step ever UPDATEs Daily Bars or Raw Files
- [ ] Fixture test: RELIANCE bonus 1:1, ex-date 28-Oct-2024. Adjusted close on 25-Oct-2024 ≈ 1327.85, and adjusted quantity doubles
- [ ] Fixture test: HDFCBANK bonus 1:1, ex-date 26-Aug-2025
- [ ] Fixture test: BAJFINANCE bonus 4:1 plus split 2→1 face value on 16-Jun-2025 combine into a factor of 10
- [ ] A Corporate Action whose description has no Action Interpretation is skipped and reported, never guessed

## Blocked by

- #0001
