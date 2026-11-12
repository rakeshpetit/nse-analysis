---
status: done
type: AFK
blocked_by: ["0006"]
---

# Apply Review Decisions

## What to build

Review Decisions are recorded in the git-tracked `review/decisions.csv`, and they are the only way a person changes pipeline output (ADR 0001). This replaces the old hand-edits in `deletedsplits.md`.

Decisions supported in this slice:

- **add action**: a missing Corporate Action for a symbol, ex-date and factor
- **reject action**: ignore a specific Corporate Action
- **dismiss break**: a Suspected Break that's a genuine price move, such as an F&O stock with no price band

Each row refers to a review item ID from #0006, or names the symbol and date directly. The next `build` applies the decisions, and `pipeline review` no longer shows items that have been decided.

## Acceptance criteria

- [x] Adding a missing action removes the corresponding Suspected Break and adjusts the earlier bars
- [x] Rejecting an action removes its factor from the Adjusted layer
- [x] A dismissed break drops out of the review queue and leaves prices unchanged
- [x] A decision that refers to a non-existent item makes `build` fail loudly, never silently
- [x] Deleting `review/decisions.csv` and rebuilding restores the undecided state, which shows the database holds no state that isn't in git

## Blocked by

- #0006
