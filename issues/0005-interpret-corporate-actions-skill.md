---
status: done
type: AFK
blocked_by: ["0004"]
---

# `interpret-corporate-actions` Claude Code skill

## What to build

The manual, documented step that turns new Corporate Action descriptions into Action Interpretations (ADR 0003). The pipeline never calls an LLM itself.

- `build` writes every in-window Corporate Action description that has no Action Interpretation to a pending file, and warns "N texts need interpreting".
- A project skill, committed to git as `/interpret-corporate-actions`, tells Claude Code how to read the pending file and append one Action Interpretation per distinct description to `reference/action-interpretations.csv`, using the agreed fields. NCRPS / preference-share bonuses are marked "not price-relevant".
- `build` checks each Action Interpretation's shape: a known type, positive ratios, and the fields that type requires. Rows with the wrong shape are not applied and go to the review queue.
- The skill tells the user to review the diff and commit it.

## Acceptance criteria

- [ ] The pending file lists exactly the distinct descriptions that have no interpretation
- [ ] The skill exists in the repo, is invocable as `/interpret-corporate-actions`, and documents the fields and an example for each type
- [ ] Running the skill on a pending file containing the RELIANCE, BAJFINANCE and a rights-issue description gives rows that `build` accepts
- [ ] A row with the wrong shape (e.g. a negative ratio) is rejected into the review queue and not applied
- [ ] A rebuild with no pending texts makes no LLM call and needs no network access

## Blocked by

- #0004
