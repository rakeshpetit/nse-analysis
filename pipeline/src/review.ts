import { createHash } from "node:crypto";
import { barsAroundFrom, planAdjustments, type AdjustmentPlan } from "./adjustments";
import { loadDecisions } from "./decisions";
import type { Db } from "./db";

export type ReviewKind =
  | "suspected_break"
  | "action_without_jump"
  | "demerger_estimate"
  | "no_interpretation"
  | "rejected_interpretation";

/** One Daily Bar near a review item: unadjusted open and close, and the Adjusted close. */
export interface PriceRow {
  tradeDate: string;
  open: string;
  close: string;
  adjustedClose: string;
}

/** One open item in the review queue. The ID is what a Review Decision refers to (#0007). */
export interface ReviewItem {
  id: string;
  kind: ReviewKind;
  /** One line saying what is open. */
  summary: string;
  detail: string[];
  symbol?: string;
  /** Suspected Break: the day of the jump. Action with no visible jump, or demerger estimate: its ex-date. */
  date?: string;
  /** Interpretation items: the exact Corporate Action description. */
  description?: string;
  /** Bars either side of `date`, for judging the item. */
  prices?: PriceRow[];
}

export interface ReviewOptions {
  startDate: string;
  referenceDir: string;
  /** Directory holding `decisions.csv`; decided items are not listed. */
  reviewDir?: string;
}

const BARS_BEFORE = 2;
const BARS_AFTER = 2;

/** A short key for a description text, stable across builds and runs. */
const descriptionKey = (description: string) => createHash("sha1").update(description).digest("hex").slice(0, 10);

const percent = (change: string) => {
  const p = Number(change) * 100;
  return `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;
};

/** The bars before `date`, on it (or the first one after), and after it. */
async function pricesAround(db: Db, symbol: string, date: string): Promise<PriceRow[]> {
  const { rows } = await db.query<PriceRow>(
    `SELECT trade_date::text AS "tradeDate", open::text, close::text, adjusted_close::text AS "adjustedClose"
     FROM (
       (SELECT b.trade_date, b.open, b.close, a.close AS adjusted_close
        FROM core.daily_bar b JOIN adjusted.daily_bar a USING (symbol, trade_date)
        WHERE symbol = $1 AND trade_date < $2::date ORDER BY trade_date DESC LIMIT $3)
       UNION ALL
       (SELECT b.trade_date, b.open, b.close, a.close
        FROM core.daily_bar b JOIN adjusted.daily_bar a USING (symbol, trade_date)
        WHERE symbol = $1 AND trade_date >= $2::date ORDER BY trade_date LIMIT $4)
     ) bars ORDER BY trade_date`,
    [symbol, date, BARS_BEFORE, BARS_AFTER + 1],
  );
  return rows;
}

function interpretationItems(plan: AdjustmentPlan): ReviewItem[] {
  const missing = plan.pendingTexts.map<ReviewItem>((description) => ({
    id: `no-interpretation:${descriptionKey(description)}`,
    kind: "no_interpretation",
    summary: `no Action Interpretation for "${description}"`,
    description,
    detail: plan.skipped
      .filter((a) => a.description === description)
      .map((a) => `${a.exDate} ${a.symbol}`)
      .concat("run /interpret-corporate-actions"),
  }));
  const rejected = plan.rejected.map<ReviewItem>((r) => ({
    id: `rejected-interpretation:${descriptionKey(r.description)}`,
    kind: "rejected_interpretation",
    summary: `Action Interpretation for "${r.description}" rejected: ${r.reason}`,
    description: r.description,
    detail: [r.reason, "fix its row in reference/action-interpretations.csv"],
  }));
  return [...missing, ...rejected];
}

/** The price of a bar as shown to a person. */
const price = (text: string) => Number(text).toFixed(2);

async function demergerItems(db: Db, plan: AdjustmentPlan): Promise<ReviewItem[]> {
  const items: ReviewItem[] = [];
  for (const d of plan.pendingDemergers) {
    const confirm = `confirm with "confirm_demerger,demerger:${d.symbol}:${d.exDate},,,<factor>,<note>" (leave factor blank to accept the estimate)`;
    const head = `${d.symbol} demerger going ex on ${d.exDate}`;
    const estimated = d.estimate && d.prev && d.next;
    items.push({
      id: `demerger:${d.symbol}:${d.exDate}`,
      kind: "demerger_estimate",
      summary: estimated
        ? `${head}: estimated factor ${(Number(d.estimate!.num) / Number(d.estimate!.den)).toFixed(4)}, not applied until confirmed`
        : `${head}: no estimate (no Daily Bar on both sides of the ex-date), not applied until confirmed`,
      detail: [
        estimated
          ? `Estimate: close ${price(d.prev!.close)} on ${d.prev!.tradeDate} ÷ open ${price(d.next!.open)} on ${d.next!.tradeDate}`
          : "Estimate: previous close ÷ ex-date open, which needs a Daily Bar before and on or after the ex-date",
        confirm,
      ],
      symbol: d.symbol,
      date: d.exDate,
      prices: await pricesAround(db, d.symbol, d.exDate),
    });
  }
  return items;
}

/**
 * Every open item for a human, from the latest `build`: Suspected Breaks, actions
 * with no visible jump, demergers awaiting confirmation, descriptions with no Action Interpretation and
 * interpretations rejected for shape. IDs depend only on what the item is about
 * (symbol and date, or description text), so they survive rebuilds.
 */
export async function review(db: Db, opts: ReviewOptions): Promise<ReviewItem[]> {
  const breaks = await db.query<{
    symbol: string;
    trade_date: string;
    prev_trade_date: string;
    prev_close: string;
    open: string;
    close: string;
    open_change: string;
    close_change: string;
  }>(
    `SELECT symbol, trade_date::text, prev_trade_date::text, prev_close::text, open::text, close::text,
            open_change::text, close_change::text
     FROM adjusted.suspected_break ORDER BY symbol, trade_date`,
  );
  const noJump = await db.query<{
    symbol: string;
    ex_date: string;
    factor: string;
    prev_close: string;
    open: string;
    close: string;
  }>(
    `SELECT symbol, ex_date::text, factor::text, prev_close::text, open::text, close::text
     FROM adjusted.action_without_jump ORDER BY symbol, ex_date`,
  );

  const items: ReviewItem[] = [];
  for (const b of breaks.rows) {
    items.push({
      id: `break:${b.symbol}:${b.trade_date}`,
      kind: "suspected_break",
      summary: `${b.symbol} jumped on ${b.trade_date} and no applied Corporate Action explains it`,
      detail: [
        `Adjusted close ${Number(b.prev_close).toFixed(2)} on ${b.prev_trade_date}, ` +
          `open ${Number(b.open).toFixed(2)} (${percent(b.open_change)}), ` +
          `close ${Number(b.close).toFixed(2)} (${percent(b.close_change)})`,
      ],
      symbol: b.symbol,
      date: b.trade_date,
      prices: await pricesAround(db, b.symbol, b.trade_date),
    });
  }
  for (const a of noJump.rows) {
    items.push({
      id: `no-jump:${a.symbol}:${a.ex_date}`,
      kind: "action_without_jump",
      summary: `${a.symbol} Corporate Action going ex on ${a.ex_date} has no visible jump`,
      detail: [
        `Factor ${Number(a.factor)}; close before ${Number(a.prev_close).toFixed(2)}, ` +
          `open ${Number(a.open).toFixed(2)}, close ${Number(a.close).toFixed(2)} (unadjusted)`,
      ],
      symbol: a.symbol,
      date: a.ex_date,
      prices: await pricesAround(db, a.symbol, a.ex_date),
    });
  }
  const plan = await planAdjustments(opts.referenceDir, opts.startDate, await loadDecisions(opts.reviewDir), barsAroundFrom(db));
  items.push(...(await demergerItems(db, plan)), ...interpretationItems(plan));
  return items;
}
