---
status: done
type: AFK
blocked_by: ["0020"]
---

# Volume pane under the price chart

## What to build

Add a daily volume histogram under the price line on the company page. It shows the Adjusted traded quantity, so volume stays comparable across splits and bonuses. It shares the time axis and crosshair with the price chart, and the tooltip adds that day's volume.

## Acceptance criteria

- [x] Each Trading Day in the window has a volume bar under its price point
- [x] Hovering shows the volume alongside the prices
- [x] Volume across a split or bonus ex-date shows no step change caused by the action itself

## Blocked by

- #0020
