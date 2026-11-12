import type pg from "pg";
import { planAdjustments, type AdjustmentPlan, type SkippedAction } from "./adjustments";
import { withTransaction, type Db } from "./db";

export interface BuildOptions {
  startDate: string;
  /** Directory holding `corporate-actions/*.json` and `action-interpretations.csv`. Without it nothing is adjusted. */
  referenceDir?: string;
}

export interface BuildResult {
  bars: number;
  /** Corporate Actions in the window that produced no Adjustment Factor, and why. */
  skippedActions: SkippedAction[];
}

/** Trimmed text, with NSE's "no value" markers (blank, "-") as NULL. */
const nullIfBlank = (col: string) => `NULLIF(NULLIF(btrim(${col}), ''), '-')`;

/** Staged columns holding a bar's values, as named in staged.bhavcopy_row. */
const VALUE_COLUMNS = [
  "prev_close",
  "open_price",
  "high_price",
  "low_price",
  "last_price",
  "close_price",
  "avg_price",
  "ttl_trd_qnty",
  "turnover_lacs",
  "no_of_trades",
  "deliv_qty",
  "deliv_per",
] as const;

/**
 * Staged Rows in scope, normalised: padding and "no value" markers removed, and
 * the Trading Day taken from the date inside the file (never the file name).
 */
const IN_SCOPE_ROWS = `
  SELECT source_file, line_number,
         btrim(symbol) AS symbol,
         btrim(series) AS series,
         to_date(btrim(date1), 'DD-Mon-YYYY') AS trade_date,
         ${VALUE_COLUMNS.map((c) => `${nullIfBlank(c)} AS ${c}`).join(", ")}
  FROM staged.bhavcopy_row
  WHERE to_date(btrim(date1), 'DD-Mon-YYYY') >= $1::date`;

/**
 * Quality Flags: one row per (bar, flag name). The names are stable; analyses
 * pick which to exclude. Open/last/close are only checked against the range when
 * the range itself is sane (high >= low), so an inverted bar carries just
 * high_below_low rather than a pile of knock-on flags.
 */
const FLAG_BARS = `
  INSERT INTO core.daily_bar_flag (symbol, trade_date, flag)
  SELECT b.symbol, b.trade_date, f.flag
  FROM core.daily_bar b
  CROSS JOIN LATERAL (VALUES
    ('high_below_low',         b.high < b.low),
    ('open_outside_range',     b.high >= b.low AND b.open  NOT BETWEEN b.low AND b.high),
    ('close_outside_range',    b.high >= b.low AND b.close NOT BETWEEN b.low AND b.high),
    ('last_outside_range',     b.high >= b.low AND b.last  NOT BETWEEN b.low AND b.high),
    ('zero_qty_nonzero_price', b.traded_qty = 0
                               AND (b.open <> 0 OR b.high <> 0 OR b.low <> 0 OR b.last <> 0 OR b.close <> 0))
  ) AS f(flag, raised)
  WHERE f.raised`;

/**
 * Adjusted Prices: each Daily Bar divided (prices) or multiplied (quantities) by
 * the cumulative factor of the first ex-date after it, so bars on or after the
 * last ex-date, and a symbol with no actions, keep factor 1. Whether the
 * ex-date itself was a Trading Day for the symbol does not matter: only bars
 * strictly before it are touched.
 */
const ADJUST_BARS = `
  INSERT INTO adjusted.daily_bar
    (symbol, trade_date, series, factor, prev_close, open, high, low, last, close,
     avg_price, traded_qty, turnover_lacs, trades, delivery_qty, delivery_pct)
  SELECT b.symbol, b.trade_date, b.series, f.num / f.den,
         b.prev_close * f.den / f.num,
         b.open * f.den / f.num,
         b.high * f.den / f.num,
         b.low * f.den / f.num,
         b.last * f.den / f.num,
         b.close * f.den / f.num,
         b.avg_price * f.den / f.num,
         b.traded_qty * f.num / f.den,
         b.turnover_lacs,
         b.trades,
         b.delivery_qty * f.num / f.den,
         b.delivery_pct
  FROM core.daily_bar b
  CROSS JOIN LATERAL (
    SELECT coalesce(min(cumulative_num), 1) AS num, coalesce(min(cumulative_den), 1) AS den
    FROM (
      SELECT cumulative_num, cumulative_den
      FROM adjusted.adjustment_factor a
      WHERE a.symbol = b.symbol AND a.ex_date > b.trade_date
      ORDER BY a.ex_date
      LIMIT 1
    ) next_ex_date
  ) f`;

async function buildAdjusted(client: pg.PoolClient, plan: AdjustmentPlan): Promise<void> {
  await client.query("TRUNCATE adjusted.daily_bar, adjusted.adjustment_factor");
  await client.query(
    `INSERT INTO adjusted.adjustment_factor
       (symbol, ex_date, factor_num, factor_den, cumulative_num, cumulative_den)
     SELECT * FROM unnest($1::text[], $2::date[], $3::numeric[], $4::numeric[], $5::numeric[], $6::numeric[])`,
    [
      plan.factors.map((f) => f.symbol),
      plan.factors.map((f) => f.exDate),
      plan.factors.map((f) => f.factor.num.toString()),
      plan.factors.map((f) => f.factor.den.toString()),
      plan.factors.map((f) => f.cumulative.num.toString()),
      plan.factors.map((f) => f.cumulative.den.toString()),
    ],
  );
  await client.query(ADJUST_BARS);
}

const MAX_REPORTED_CONFLICTS = 20;

type Normalised = Record<string, string | number | null>;

interface ConflictRow {
  trade_date: string;
  symbol: string;
  series: string;
  a: Normalised;
  b: Normalised;
}

/**
 * Different Raw Files may claim the same Trading Day (holiday-named copies,
 * misdated files). That is fine while every row they share agrees. When two
 * files disagree on a row we cannot tell which is right, so the build stops.
 */
async function assertNoConflicts(client: pg.PoolClient, startDate: string): Promise<void> {
  const { rows } = await client.query<ConflictRow>(
    `WITH n AS (${IN_SCOPE_ROWS})
     SELECT a.trade_date::text AS trade_date, a.symbol, a.series,
            to_jsonb(a) AS a, to_jsonb(b) AS b
     FROM n a
     JOIN n b ON b.trade_date = a.trade_date
             AND b.symbol = a.symbol
             AND b.series = a.series
             AND (b.source_file, b.line_number) > (a.source_file, a.line_number)
     WHERE ${VALUE_COLUMNS.map((c) => `a.${c} IS DISTINCT FROM b.${c}`).join(" OR ")}
     ORDER BY a.trade_date, a.symbol, a.series, a.source_file, a.line_number, b.source_file, b.line_number`,
    [startDate],
  );
  if (rows.length === 0) return;

  const show = (v: unknown) => (v === null ? "(none)" : String(v));
  const lines = rows.slice(0, MAX_REPORTED_CONFLICTS).map(({ trade_date, symbol, series, a, b }) => {
    const diffs = VALUE_COLUMNS.filter((c) => a[c] !== b[c]).map(
      (c) => `${c}: ${show(a[c])} vs ${show(b[c])}`,
    );
    return (
      `  ${trade_date} ${symbol} ${series}: ${a.source_file}:${a.line_number} vs ` +
      `${b.source_file}:${b.line_number}\n    ${diffs.join("; ")}`
    );
  });
  const more =
    rows.length > MAX_REPORTED_CONFLICTS
      ? `\n  ... and ${rows.length - MAX_REPORTED_CONFLICTS} more`
      : "";
  throw new Error(
    `Raw Files disagree on ${rows.length} row(s) for the same Trading Day:\n${lines.join("\n")}${more}`,
  );
}

/**
 * Rebuilds core.daily_bar from scratch out of staged.bhavcopy_row, in one
 * transaction. Daily Bars are derived and unadjusted: nothing is edited in
 * place, so running it again always reproduces the same bars. Raw Files that
 * agree on a Trading Day collapse into one bar per symbol; ones that disagree
 * make the build fail before anything changes.
 */
export async function build(db: Db, opts: BuildOptions): Promise<BuildResult> {
  const plan: AdjustmentPlan = opts.referenceDir
    ? await planAdjustments(opts.referenceDir, opts.startDate)
    : { factors: [], skipped: [] };
  return withTransaction(db, async (client) => {
    await assertNoConflicts(client, opts.startDate);
    await client.query("TRUNCATE core.daily_bar, core.daily_bar_flag");
    const res = await client.query(
      `INSERT INTO core.daily_bar
         (symbol, trade_date, series, prev_close, open, high, low, last, close,
          avg_price, traded_qty, turnover_lacs, trades, delivery_qty, delivery_pct)
       SELECT DISTINCT ON (symbol, trade_date, series)
              symbol, trade_date, series,
              prev_close::numeric,
              open_price::numeric,
              high_price::numeric,
              low_price::numeric,
              last_price::numeric,
              close_price::numeric,
              avg_price::numeric,
              ttl_trd_qnty::bigint,
              turnover_lacs::numeric,
              no_of_trades::bigint,
              deliv_qty::bigint,
              deliv_per::numeric
       FROM (${IN_SCOPE_ROWS}) n
       WHERE series IN ('EQ', 'BE')
       ORDER BY symbol, trade_date, series, source_file, line_number`,
      [opts.startDate],
    );
    await client.query(FLAG_BARS);
    await buildAdjusted(client, plan);
    return { bars: res.rowCount ?? 0, skippedActions: plan.skipped };
  });
}
