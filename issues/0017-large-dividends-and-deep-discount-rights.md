---
status: ready
type: AFK
blocked_by: ["0013"]
---

# Large dividends and deep-discount rights distort the adjusted series

## What we saw

- `SETCO` fell 44% on 2026-06-02, the ex-date of a Rs 13 interim dividend on a Rs 28.62 stock. Dividends
  are not Corporate Actions here, so the drop surfaces as a Suspected Break and had to be dismissed.
- `NARMADA` 9:5 rights at Rs 10 (face 5 + premium 5) on a Rs 24.08 stock: TERP gives a factor of about
  1.59, the market moved by 1.27 (24.08 → 18.95). It shows as a break (+26%) and a no-jump item. It was
  ruled by rejecting the action and adding an `add_action` with the observed factor 1.27.

## What to build

Decide whether to (a) adjust for dividends above a size threshold, or only say so in the review item
("a dividend of Rs 13 goes ex today"), and (b) report the observed factor beside the TERP factor in rights
review items, so a deep-discount rights issue is easy to correct.

## Acceptance criteria

- [ ] A break on a dividend ex-date names the dividend
- [ ] A rights issue whose observed jump differs from TERP by more than the threshold shows both factors
