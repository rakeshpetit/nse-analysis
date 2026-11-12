---
status: ready
type: AFK
blocked_by: ["0013"]
---

# Rights-entitlement tickers flood the review queue

## What we saw

In the first full review pass (#0013), 179 of 285 Suspected Breaks were on rights-entitlement
tickers (`SYMBOL-RE`, `SYMBOL-RE1`, … in series BE, e.g. `SILGO-RE1`, `BHANDA-RE2`). They trade for a
few days around a rights issue at tiny prices (Rs 0.02–15), moving 20–50% a day. Every one is a
genuine price move, so each would need a `dismiss_break` row.

## What to build

Decide, then implement: exclude `-RE<n>` tickers from Suspected Breaks (and from the review queue), or
give them a queue section that does not count as open. Check first that no real Security has a symbol
ending in `-RE`/`-RE<n>` as its own ticker.

## Acceptance criteria

- [ ] A rights-entitlement ticker's moves never appear as open review items
- [ ] A normal Security with an unexplained jump still does
- [ ] README says what is excluded and why
