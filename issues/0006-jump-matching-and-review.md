---
status: done
type: AFK
blocked_by: ["0004"]
---

# Jump matching, Suspected Breaks and `pipeline review`

## What to build

Check Corporate Actions against what the prices actually did, and give the human a review queue.

- **Matching.** For each symbol, compare the previous Daily Bar's close with today's open and close, after applying known Adjustment Factors.
  - A move bigger than the threshold, in either direction, with no Corporate Action to explain it is a **Suspected Break**. The threshold is 20% by default and set in config.
  - An applied Corporate Action with no corresponding jump on its ex-date is flagged as "action with no visible jump".
- **Prev-close check.** Add a Quality Flag for a Daily Bar whose prev close doesn't match the previous Daily Bar's close and isn't explained by a Corporate Action. NSE never adjusts prev close on ex-dates.
- **`pipeline review`** lists every open item:
  - Suspected Breaks
  - actions with no visible jump
  - descriptions with no interpretation, and interpretations rejected for shape (#0005)

  Each item has a stable ID and shows the prices around the date. Suspected Breaks are never applied automatically.

## Acceptance criteria

- [ ] After a correct bonus is applied, RELIANCE has no Suspected Break around 28-Oct-2024
- [ ] If the RELIANCE interpretation is removed from the fixtures, a Suspected Break appears on 28-Oct-2024
- [ ] A fixture action with the wrong ratio gives a Suspected Break and/or an "action with no visible jump" item
- [ ] Upward jumps are detected as well as drops
- [ ] Each item in the `pipeline review` output has a stable ID that a Review Decision can refer to (#0007)

## Blocked by

- #0004
