# Issues

Local issue tracker for the NSE data pipeline. Each issue is one markdown file, `NNNN-slug.md`, with frontmatter:

- `status`: `ready` | `in-progress` | `done`
- `type`: `AFK` (an agent can do it end to end) | `HITL` (needs a human)
- `blocked_by`: issue numbers that must be `done` first

Vocabulary: [GLOSSARY.md](../GLOSSARY.md). Decisions: [docs/adr/](../docs/adr/).

| #    | Issue                                                                  | Type | Blocked by                   |
| ---- | ---------------------------------------------------------------------- | ---- | ---------------------------- |
| 0001 | [First tracer: Raw Files → Daily Bars](0001-first-tracer-raw-files-to-daily-bars.md) | AFK  | –                            |
| 0002 | [Messy Raw Files](0002-messy-raw-files.md)                             | AFK  | 0001                         |
| 0003 | [Quality Flags on Daily Bars](0003-quality-flags.md)                   | AFK  | 0001                         |
| 0004 | [First adjusted series: bonus, split, consolidation](0004-first-adjusted-series.md) | AFK  | 0001                         |
| 0005 | [`interpret-corporate-actions` skill](0005-interpret-corporate-actions-skill.md) | AFK  | 0004                         |
| 0006 | [Jump matching, Suspected Breaks, `review`](0006-jump-matching-and-review.md) | AFK  | 0004                         |
| 0007 | [Apply Review Decisions](0007-apply-review-decisions.md)               | AFK  | 0006                         |
| 0008 | [Rights issues using TERP](0008-rights-issue-terp.md)                  | AFK  | 0004                         |
| 0009 | [Demerger estimates confirmed by review](0009-demerger-estimates.md)   | AFK  | 0007                         |
| 0010 | [Securities and renames](0010-securities-and-renames.md)               | AFK  | 0004                         |
| 0011 | [`fetch` command](0011-fetch-command.md)                               | AFK  | 0002                         |
| 0012 | [`daily` command](0012-daily-command.md)                               | AFK  | 0003, 0005, 0007, 0010, 0011 |
| 0013 | [First full review pass](0013-first-full-review-pass.md)               | HITL | 0005, 0008, 0009, 0012       |
