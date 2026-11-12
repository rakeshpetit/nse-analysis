---
status: ready
type: AFK
blocked_by: ["0013"]
---

# ETF unit splits missing from NSE's corporate-action list

## What we saw

Sixteen ETFs show a one-day drop of about 90% (or 99%) with no Corporate Action: `BANKNIFTY1`, `CONS`,
`MIDCAP`, `NV20`, `SILVER1` (2026-02-27), `GROWWGOLD`, `GROWWSLVR`, `QNIFTY`, `LICMFGOLD`, `IVZINGOLD`,
`GOLDADD`, `SILVERADD`, `HEALTHADD`, `MIDQ50ADD`, `PSUBANK`, `IVZINNIFTY`. Previous close ÷ open is
about 10 (about 100 for `IVZINGOLD`, `LICMFGOLD`). They are unit splits the NSE list lacks, and each
needs an `add_action`.

## What to build

Make a break whose previous close ÷ open sits close to a round ratio (10, 5, 2, 100) say so in the
review item, with the suggested `add_action` row. Keep the decision with the reviewer.

## Acceptance criteria

- [ ] A break near a round ratio shows "looks like an N:1 split" and the row to paste
- [ ] A break that is not near a round ratio shows no suggestion
