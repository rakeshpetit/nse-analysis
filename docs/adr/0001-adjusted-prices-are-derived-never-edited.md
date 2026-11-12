# Adjusted prices are derived, never edited in place

The first attempt (`packages/stockdata`) fixed splits by running `UPDATE stock_data SET close = close / ratio` and by hand-deleting false positives from a heuristically filled `stock_splits` table. Each mistake then needed a restore from a backup table, and the correct state of the data existed only in the database. We decided that Raw Files and Reference Snapshots are never modified. Daily Bars hold only unadjusted values, and Adjusted prices are always recomputed from Daily Bars plus Adjustment Factors. The only way a person changes the output is a Review Decision committed to git, so a full rebuild from `files/`, `reference/` and `review/` always reproduces the same result.

## Considered Options

- **Mutate prices in place (previous approach).** Rejected: errors build on each other, they can't be traced back to a cause, and undoing them needs backups.
- **Heuristic split detection as the source of truth.** Rejected: a 20–90% drop flags real crashes and misses consolidations. Detection now only produces Suspected Breaks for review.
