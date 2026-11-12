---
status: ready
type: AFK
blocked_by: ["0007"]
---

# Demerger estimates confirmed by review

## What to build

NSE publishes demergers with no ratio. For each in-window demerger, the pipeline proposes an estimated factor: the previous Daily Bar's close ÷ the ex-date's open (NSE's price-discovery session). The estimate shows up in `pipeline review`, and it is applied **only** after a Review Decision confirms it. That decision can accept the estimate or give a different factor.

## Acceptance criteria

- [ ] Each in-window demerger appears in `pipeline review` with its estimated factor and the surrounding prices
- [ ] An unconfirmed demerger is never applied
- [ ] A confirming Review Decision, whether it accepts the estimate or gives an explicit factor, is applied on the next build
- [ ] There's a fixture test for one real demerger in the window

## Blocked by

- #0007
