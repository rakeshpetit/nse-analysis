---
status: ready
type: AFK
blocked_by: ["0001"]
---

# Quality Flags on Daily Bars

## What to build

`build` attaches Quality Flags to Daily Bars that look implausible. Flagged bars are kept, never deleted or corrected. Analyses can choose to exclude them.

Flags in this slice:

- high below low
- close (or open/last) outside the high–low range
- zero traded quantity with a non-zero price

The "prev close doesn't match the previous Daily Bar's close" check needs Corporate Actions to rule out legitimate breaks, so it belongs with jump matching in #0006.

## Acceptance criteria

- [ ] Each flag has a stable name, and one bar can carry several flags
- [ ] Fixture tests cover each flag
- [ ] There is a query or report listing flag counts by flag name across all Daily Bars
- [ ] Flagged bars still appear in the Adjusted layer, carrying their flags

## Blocked by

- #0001
