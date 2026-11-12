---
status: ready
type: AFK
blocked_by: ["0004"]
---

# Rights issues using TERP

## What to build

Adjustment Factors for rights issues, from an Action Interpretation that has ratio a:b (a new shares for every b held) and an issue price (face value + premium):

- TERP = (b · prior close + a · issue price) ÷ (a + b)
- factor = prior close ÷ TERP

Prior close is the last Daily Bar close before the ex-date. A rights issue whose issue price is at or above the prior close gives a factor of 1 or less; record it, but treat it as having no visible jump in matching.

## Acceptance criteria

- [ ] Fixture test with a real rights issue from the window, checking the expected factor
- [ ] A rights factor combines with other same-day actions by multiplying
- [ ] A rights Action Interpretation without an issue price is rejected for its shape, not guessed

## Blocked by

- #0004
