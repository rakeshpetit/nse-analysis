---
status: ready
type: AFK
blocked_by: ["0019"]
---

# Company page with an Adjusted Price chart

## What to build

`/companies/:symbol` shows one Security's Adjusted close as a line chart, drawn with `lightweight-charts`.

- **Addressing.** The symbol in the URL is the Security's current symbol. It is resolved to the stable Security ID, so the chart covers its whole history across renames. An unknown symbol is a 404 page.
- **Ranges.** 3M, 6M and 1Y buttons, defaulting to 1Y. Each counts calendar months back from the latest Trading Day in the database, not from today's date. A Security with less history shows what it has, with no padding.
- **Hover.** A crosshair tooltip shows the date and the Adjusted open, high, low and close for that Trading Day.
- Quality-Flagged bars and unresolved Suspected Breaks are drawn as they are, with no markers.

## Acceptance criteria

- [ ] Clicking a row on the list page opens that company's chart
- [ ] 3M/6M/1Y change the window, and the last point is always the latest Trading Day
- [ ] Hovering shows that day's Adjusted prices
- [ ] A Security that was renamed shows bars from before and after the rename under its current symbol
- [ ] An unknown symbol gives a 404
- [ ] Data-access tests cover the range windows and symbol → Security resolution after a rename

## Blocked by

- #0019
