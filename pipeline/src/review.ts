import { createHash } from "node:crypto";
import { barsAroundFrom, planAdjustments, type AdjustmentPlan } from "./adjustments";
import { loadDecisions } from "./decisions";
import type { Db } from "./db";
import { loadSecurities } from "./securities";

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
async function pricesAround(db: Db, securityId: string, date: string): Promise<PriceRow[]> {
  const { rows } = await db.query<PriceRow>(
    `SELECT trade_date::text AS "tradeDate", open::text, close::text, adjusted_close::text AS "adjustedClose"
     FROM (
       (SELECT b.trade_date, b.open, b.close, a.close AS adjusted_close
        FROM core.daily_bar b JOIN adjusted.daily_bar a USING (security_id, trade_date)
        WHERE security_id = $1 AND trade_date < $2::date ORDER BY trade_date DESC LIMIT $3)
       UNION ALL
       (SELECT b.trade_date, b.open, b.close, a.close
        FROM core.daily_bar b JOIN adjusted.daily_bar a USING (security_id, trade_date)
        WHERE security_id = $1 AND trade_date >= $2::date ORDER BY trade_date LIMIT $4)
     ) bars ORDER BY trade_date`,
    [securityId, date, BARS_BEFORE, BARS_AFTER + 1],
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
      prices: await pricesAround(db, d.securityId, d.exDate),
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
    security_id: string;
    symbol: string;
    trade_date: string;
    prev_trade_date: string;
    prev_close: string;
    open: string;
    close: string;
    open_change: string;
    close_change: string;
  }>(
    `SELECT security_id, symbol, trade_date::text, prev_trade_date::text, prev_close::text, open::text, close::text,
            open_change::text, close_change::text
     FROM adjusted.suspected_break ORDER BY symbol, trade_date`,
  );
  const noJump = await db.query<{
    security_id: string;
    symbol: string;
    ex_date: string;
    factor: string;
    prev_close: string;
    open: string;
    close: string;
  }>(
    `SELECT security_id, symbol, ex_date::text, factor::text, prev_close::text, open::text, close::text
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
      prices: await pricesAround(db, b.security_id, b.trade_date),
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
      prices: await pricesAround(db, a.security_id, a.ex_date),
    });
  }
  const plan = await planAdjustments(
    opts.referenceDir,
    opts.startDate,
    await loadDecisions(opts.reviewDir),
    await loadSecurities(db),
    barsAroundFrom(db),
  );
  items.push(...(await demergerItems(db, plan)), ...interpretationItems(plan));
  return items;
}

/** A Security-day whose Market Cap (Issue Size × our unadjusted close) is not the one NSE printed. */
export interface MarketCapMismatch {
  symbol: string;
  tradeDate: string;
  issueSize: string;
  /** Our unadjusted close for the day. */
  close: string;
  /** Issue Size × close. */
  marketCap: string;
  /** The `Market Cap(Rs.)` in the Market Cap File. */
  fileMarketCap: string;
  /** (marketCap - fileMarketCap) / fileMarketCap. */
  difference: string;
}

/** The share of the file's Market Cap beyond which our Market Cap counts as different. */
export const MARKET_CAP_TOLERANCE = 0.005;

/**
 * Every Security-day where our Market Cap differs from the Market Cap File's by more than the
 * tolerance (0.5%). Informational: no Review Decision is needed, and none is ever recorded.
 */
export async function marketCapMismatches(db: Db): Promise<MarketCapMismatch[]> {
  const { rows } = await db.query<MarketCapMismatch>(
    `SELECT b.symbol, b.trade_date::text AS "tradeDate", i.issue_size::text AS "issueSize", b.close::text AS close,
            (i.issue_size * b.close)::text AS "marketCap", i.file_market_cap::text AS "fileMarketCap",
            ((i.issue_size * b.close - i.file_market_cap) / i.file_market_cap)::text AS difference
     FROM core.issue_size i
     JOIN core.daily_bar b USING (security_id, trade_date)
     WHERE i.file_market_cap > 0
       AND abs(i.issue_size * b.close - i.file_market_cap) / i.file_market_cap > $1
     ORDER BY b.trade_date, b.symbol`,
    [MARKET_CAP_TOLERANCE],
  );
  return rows;
}

/** The lines `yarn review` prints for Market Cap mismatches: a section of its own, apart from the open items. */
export function formatMarketCapMismatches(mismatches: MarketCapMismatch[]): string[] {
  if (mismatches.length === 0) return [];
  const rs = (v: string) => Number(v).toExponential(4);
  return [
    `\nMarket Cap differs from the Market Cap File by more than ${MARKET_CAP_TOLERANCE * 100}% (informational, no decision needed): ${mismatches.length} Security-day(s)`,
    ...mismatches.map((m) => {
      const pct = (Number(m.difference) * 100).toFixed(2);
      return `  ${m.tradeDate} ${m.symbol}: ours ${rs(m.marketCap)} (${m.issueSize} shares × ${Number(m.close).toFixed(2)}), file ${rs(m.fileMarketCap)} (${pct}%)`;
    }),
  ];
}
