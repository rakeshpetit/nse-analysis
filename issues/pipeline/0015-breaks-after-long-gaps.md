---
status: ready
type: AFK
blocked_by: ["0013"]
---

# Suspected Breaks after long trading gaps, and symbol reuse

## What we saw

Six breaks sit after a gap of more than 60 days between Daily Bars (`BURNPUR` 2025-01 → 2026-08,
`MBECL` 2024-09 → 2026-09, `SUMEETINDS` 2024-10 → 2025-06, `NEUEON`, `TAKE`, `BFUTILITIE`): suspended
stocks that resumed trading. `MBECL` (+3874%) and `SUMEETINDS` (+990%) look more like NSE reusing a
symbol for another company than like one price series.

## What to build

Report the gap in the review item (days since the previous bar) so a reviewer sees at once that it
is a resumption. Consider a separate item kind for gaps above a threshold, and a way for a Review
Decision to say "different company" (a new Security from that date).

## Acceptance criteria

- [ ] A break after a long gap shows the gap
- [ ] A reviewer can tell "resumed trading" from "price jumped"
- [ ] A symbol reused by another company can be split into its own Security
