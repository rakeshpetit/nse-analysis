---
name: interpret-corporate-actions
description: Turn new NSE Corporate Action descriptions into Action Interpretations in reference/action-interpretations.csv. Use when `pipeline build` says "N texts need interpreting", or the user runs /interpret-corporate-actions.
---

# Interpret corporate actions

NSE gives a Corporate Action's ratio only as free text. Each distinct text is interpreted **once**, by you, and recorded as an Action Interpretation (ADR 0003, `docs/adr/0003-corporate-action-text-interpreted-by-claude-code.md`). Builds read only the CSV. The pipeline never calls an LLM.

## Steps

1. Read `reference/pending-interpretations.txt`: one description per line, the exact distinct texts that have no interpretation yet. If it is missing or empty, there is nothing to do; say so and stop.
2. For each line, decide the type and fields (below). Interpret only what the text says. Never guess a ratio or a price. If you cannot tell, leave the text out and tell the user which one and why. `build` will keep listing it as pending.
3. Append **one row per description** to `reference/action-interpretations.csv` (create it with the header if absent). `description` is the text **copied exactly, character for character** (spacing included); it is the lookup key. Quote the field if it contains a comma or a double quote (double the quote). Do not edit or reorder existing rows, and never add a description that is already in the file.
4. Run `yarn workspace @nse-analysis/pipeline build` (or `yarn build` in `pipeline/`). Every row must be accepted: no "Rejected ... Action Interpretation" line for rows you added. Fix and re-run if so.
5. Tell the user to **review the diff of `reference/action-interpretations.csv` and commit it**. Do not commit it yourself.

## Columns

`description,type,ratio,old_face_value,new_face_value,issue_price`

| type                 | meaning                                              | required fields                             | other fields |
| -------------------- | ---------------------------------------------------- | ------------------------------------------- | ------------ |
| `bonus`              | a bonus shares for every b held ("Bonus a:b")        | `ratio` = `a:b`                             | empty        |
| `split`              | face value reduced (sub-division)                    | `old_face_value` > `new_face_value`         | empty        |
| `consolidation`      | face value increased                                 | `old_face_value` < `new_face_value`         | empty        |
| `rights`             | a new shares for every b held, at `issue_price`      | `ratio` = `a:b`, `issue_price`              | empty        |
| `demerger`           | a business is split off                              | none: the factor is estimated and confirmed by review | empty        |
| `not_price_relevant` | changes no share price: see below                    | none                                        | empty        |

Rules `build` enforces (a row that breaks them is **not applied** and goes to the review queue). Keep fields a type does not use empty; that is not checked, but it keeps the file readable:

- `type` is one of the above, written exactly.
- Ratios are `a:b`, two positive whole numbers. Face values and `issue_price` are positive plain numbers (`10`, `2.5`): no `Rs`, `Re`, `/-` or thousands separators.
- A split's new face value is lower than its old one; a consolidation's is higher.

### Reading the text

- **Bonus a:b**: `Bonus 1:1` -> `1:1`; `Bonus 4:1` -> `4:1`. The first number is the new shares, the second the shares held.
- **Split / consolidation**: take the two face values from "From Rs X/- Per Share To Rs Y/-". `Re 1` is 1. Split if Y < X, consolidation if Y > X.
- **Rights**: `Rights a:b @ Premium Rs P/-`: `ratio` = `a:b`, and `issue_price` = **face value + premium**. The face value is not in the text; take it from the `faceVal` of the same symbol's entry in the newest `reference/corporate-actions/*.json`. If the text gives no premium or you cannot find the face value, do not guess; report it.
- **`not_price_relevant`**: actions that do not change what an ordinary share trades at, such as a bonus on **NCRPS or other preference shares**, or a scheme of arrangement with no share-count effect. When a text names preference shares (NCRPS, "Preference Shares"), it is `not_price_relevant`, however much it looks like a bonus.
- **Demerger**: record `demerger` with no other fields. `build` estimates its factor (previous close ÷ ex-date open) but applies it only after a `confirm_demerger` Review Decision.
- Dividends, buybacks and the like are not Corporate Actions in this project. If one shows up in the pending file, record it `not_price_relevant`.

## Examples

One of each type, as they should appear in the CSV (`examples.csv` next to this file holds the same rows and is checked by the test suite):

```csv
description,type,ratio,old_face_value,new_face_value,issue_price
Bonus 1:1,bonus,1:1,,,
Bonus 4:1,bonus,4:1,,,
Face Value Split (Sub-Division) - From Rs 10/- Per Share To Rs 2/- Per Share,split,,10,2,
Face Value Consolidation - From Re 1/- Per Share To Rs 10/- Per Share,consolidation,,1,10,
Rights 13:118 @ Premium Rs 308/-,rights,13:118,,,318
Bonus 1:1 On Non-Convertible Cumulative Redeemable Preference Shares (NCRPS),not_price_relevant,,,,
Demerger,demerger,,,,
```

The rights row assumes a face value of Rs 10 (10 + 308 = 318).

## Notes

- Interpretations are still checked against observed price jumps later (#0006); a wrong one surfaces in review, so accuracy matters more than speed.
- Never edit the pending file or the Reference Snapshots; `build` regenerates the first and the second are verbatim copies.
