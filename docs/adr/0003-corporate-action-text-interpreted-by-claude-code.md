# Corporate-action text is interpreted by a manual Claude Code step

NSE's corporate-actions data carries the ratio only in a free-text description (`"Bonus 1:1"`, `"Face Value Split (Sub-Division) - From Rs 10/- Per Share To Rs 2/- Per Share"`, `"Rights 13:118 @ Premium Rs 308/-"`), with inconsistent spacing and wording. We decided each distinct description is interpreted once by Claude Code, using the committed `interpret-corporate-actions` project skill on the owner's subscription. The result is recorded as an Action Interpretation in git-tracked `reference/action-interpretations.csv`. Builds read only that file, never an LLM, so they are deterministic and work offline. Every interpretation is still checked against observed price jumps, and any that don't match go to review.

## Considered Options

- **Regex parser.** Rejected: brittle against free-text variants, and each new phrasing means a code change.
- **LLM API call inside the pipeline.** Rejected: it means managing API keys and endpoints for a handful of new texts a month, and it would make builds non-deterministic.
