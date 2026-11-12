import { build } from "./build";
import type { Db } from "./db";
import { load } from "./load";
import { review } from "./review";

export interface DailyOptions {
  filesDir: string;
  referenceDir: string;
  reviewDir: string;
  startDate: string;
  /**
   * Brings the Raw Files and Reference Snapshots up to date. Runs first. Leave it out to
   * rebuild from what is already on disk (there is no `fetch` command yet, #0011).
   */
  fetch?: () => Promise<void>;
}

/** What one `daily` run changed, and what is now waiting for a person. */
export interface DailySummary {
  /** Trading Days with Daily Bars now that had none before this run. */
  newTradingDays: number;
  /** Ex-dates with an applied Adjustment Factor (one per Security and ex-date, however many Corporate Actions share it). */
  actionsApplied: number;
  /** Corporate Action descriptions waiting for `/interpret-corporate-actions`. */
  pendingTexts: string[];
  /** Items listed by `review`. */
  openReviewItems: number;
}

async function tradingDays(db: Db): Promise<Set<string>> {
  const { rows } = await db.query<{ day: string }>("SELECT DISTINCT trade_date::text AS day FROM core.daily_bar");
  return new Set(rows.map((r) => r.day));
}

/**
 * fetch → load → build → review. Every step can be re-run: load re-stages each Raw File,
 * and build derives everything from scratch, so a second run changes nothing and a
 * rebuild from `files/`, `reference/` and `review/` alone gives the same database.
 */
export async function daily(db: Db, opts: DailyOptions): Promise<DailySummary> {
  await opts.fetch?.();
  const before = await tradingDays(db);
  await load(db, { filesDir: opts.filesDir, startDate: opts.startDate });
  const built = await build(db, {
    startDate: opts.startDate,
    referenceDir: opts.referenceDir,
    reviewDir: opts.reviewDir,
  });
  const after = await tradingDays(db);
  const { rows } = await db.query<{ n: string }>("SELECT count(*) AS n FROM adjusted.adjustment_factor");
  const items = await review(db, {
    startDate: opts.startDate,
    referenceDir: opts.referenceDir,
    reviewDir: opts.reviewDir,
  });
  return {
    newTradingDays: [...after].filter((d) => !before.has(d)).length,
    actionsApplied: Number(rows[0]!.n),
    pendingTexts: built.pendingTexts,
    openReviewItems: items.length,
  };
}

/** The short report printed at the end of `daily`, including what the user has to do next. */
export function formatSummary(s: DailySummary): string {
  const lines = [
    "Daily summary:",
    `  ${s.newTradingDays} new Trading Day(s) loaded`,
    `  ${s.actionsApplied} Corporate Action ex-date(s) applied`,
    `  ${s.pendingTexts.length} text(s) waiting for /interpret-corporate-actions`,
    `  ${s.openReviewItems} open review item(s)`,
  ];
  if (s.pendingTexts.length > 0) {
    lines.push("Run /interpret-corporate-actions in Claude Code, then `yarn daily` again.");
  }
  if (s.openReviewItems > 0) {
    lines.push("Run `yarn review` to see the open items, record rulings in review/decisions.csv, then `yarn daily` again.");
  }
  if (s.pendingTexts.length === 0 && s.openReviewItems === 0) lines.push("Nothing needs your attention.");
  return lines.join("\n");
}
