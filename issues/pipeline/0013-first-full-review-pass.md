---
status: done
type: HITL
blocked_by: ["0005", "0008", "0009", "0012"]
---

# First full review pass

## What to build

Bring real data from Sep 2024 onwards to a reviewed state. This needs a human.

1. Run `pipeline daily`.
2. Run `/interpret-corporate-actions` over every pending Corporate Action description in the window. Review the diff of Action Interpretations and commit it.
3. Work through `pipeline review`:
   - confirm or correct demerger estimates
   - add missing actions and reject wrong ones
   - dismiss genuine price moves

   Record each ruling as a Review Decision and commit `review/decisions.csv`.
4. Rebuild and repeat until the queue is empty.

Write down anything surprising, such as patterns of false Suspected Breaks or a threshold that needs tuning, as follow-up issues.

## Acceptance criteria

- [ ] No Corporate Action description in the window lacks an Action Interpretation
- [ ] `pipeline review` shows no open items
- [ ] Spot checks of adjusted charts for RELIANCE, HDFCBANK, BAJFINANCE and five randomly chosen Securities that had Corporate Actions show no unexplained breaks
- [ ] Action Interpretations and Review Decisions are committed

## Blocked by

- #0005
- #0008
- #0009
- #0012
