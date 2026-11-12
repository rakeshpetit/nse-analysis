import { describe, expect, it } from "vitest";
import { formatSummary, type DailySummary } from "../src/daily";

const quiet: DailySummary = { newTradingDays: 3, actionsApplied: 12, pendingTexts: [], openReviewItems: 0 };

describe("formatSummary", () => {
  it("reports the four counts", () => {
    const text = formatSummary(quiet);
    expect(text).toContain("3 new Trading Day(s) loaded");
    expect(text).toContain("12 Corporate Action ex-date(s) applied");
    expect(text).toContain("0 text(s) waiting for /interpret-corporate-actions");
    expect(text).toContain("0 open review item(s)");
  });

  it("says nothing more to do when nothing is waiting", () => {
    expect(formatSummary(quiet)).toContain("Nothing needs your attention");
  });

  it("tells the user to run /interpret-corporate-actions when texts are pending", () => {
    const text = formatSummary({ ...quiet, pendingTexts: ["Bonus 7:3", "Rights 1:5"] });
    expect(text).toContain("Run /interpret-corporate-actions");
    expect(text).not.toContain("Nothing needs your attention");
  });

  it("tells the user to run a review pass when items are open", () => {
    const text = formatSummary({ ...quiet, openReviewItems: 4 });
    expect(text).toContain("Run `yarn review`");
    expect(text).not.toContain("Nothing needs your attention");
  });
});
