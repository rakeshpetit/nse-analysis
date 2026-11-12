import pg from "pg";
import { RANGE_MONTHS, type Range } from "./ranges";

/**
 * Every query the web app makes lives in this module (ADR 0004). It reads the pipeline's
 * tables and never writes: connections are opened with default_transaction_read_only=on.
 */
export type Db = pg.Pool;

/** A pool whose every transaction is read-only, so an accidental write fails. */
export function openDb(url = process.env.DATABASE_URL): Db {
  if (!url) {
    throw new Error("DATABASE_URL is not set, e.g. postgres://localhost/nse_pipeline");
  }
  return new pg.Pool({
    connectionString: url,
    options: "-c default_transaction_read_only=on",
  });
}

let shared: Db | undefined;

/** The app's one pool, opened on first use. */
export function getDb(): Db {
  return (shared ??= openDb());
}

export const TOP_COUNT = 30;

export interface RankedSecurity {
  rank: number;
  symbol: string;
  /** Market Cap in ₹ crore. */
  marketCapCr: number;
  /** Unadjusted close on the latest Trading Day. */
  close: number;
  /** Adjusted close vs previous close, in percent; null when there is no previous close. */
  changePct: number | null;
}

export interface TopSecurities {
  /** The latest Trading Day with a Daily Bar (YYYY-MM-DD); null when there are none. */
  tradeDate: string | null;
  securities: RankedSecurity[];
}

/**
 * The Securities with the highest Market Cap on the latest Trading Day. Only Securities with a
 * Daily Bar that day are ranked; each uses its most recent Issue Size on or before that day.
 */
export async function topSecurities(db: Db): Promise<TopSecurities> {
  const { rows } = await db.query<{
    trade_date: string;
    symbol: string;
    market_cap_cr: number;
    close: number;
    change_pct: number | null;
  }>(
    `WITH latest AS (SELECT max(trade_date) AS trade_date FROM core.daily_bar)
     SELECT b.trade_date::text AS trade_date,
            b.symbol,
            (i.issue_size * b.close / 10000000)::float8 AS market_cap_cr,
            b.close::float8 AS close,
            ((a.close / NULLIF(a.prev_close, 0) - 1) * 100)::float8 AS change_pct
     FROM latest
     JOIN core.daily_bar b ON b.trade_date = latest.trade_date
     JOIN adjusted.daily_bar a ON a.security_id = b.security_id AND a.trade_date = b.trade_date
     JOIN LATERAL (
       SELECT issue_size FROM core.issue_size
       WHERE security_id = b.security_id AND trade_date <= b.trade_date
       ORDER BY trade_date DESC LIMIT 1
     ) i ON true
     ORDER BY market_cap_cr DESC, b.symbol
     LIMIT $1`,
    [TOP_COUNT],
  );

  return {
    tradeDate: rows[0]?.trade_date ?? null,
    securities: rows.map((r, i) => ({
      rank: i + 1,
      symbol: r.symbol,
      marketCapCr: r.market_cap_cr,
      close: r.close,
      changePct: r.change_pct,
    })),
  };
}

export interface PriceBar {
  /** Trading Day, YYYY-MM-DD. */
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  /** Adjusted traded quantity (shares), on today's share basis. */
  volume: number;
}

export interface CompanyPrices {
  /** The Security's current symbol. */
  symbol: string;
  /** Adjusted bars, oldest first. */
  bars: PriceBar[];
}

/**
 * One Security's Adjusted Price history. `symbol` is its current symbol; it is resolved to the
 * Security ID, so bars from before a rename are included. Null when no Security trades under it.
 */
export async function companyPrices(db: Db, symbol: string, range: Range): Promise<CompanyPrices | null> {
  const { rows: found } = await db.query<{ security_id: string }>(
    "SELECT security_id FROM core.security_symbol WHERE symbol = $1 AND to_date = 'infinity'",
    [symbol],
  );
  const securityId = found[0]?.security_id;
  if (securityId === undefined) return null;

  const { rows } = await db.query<{
    date: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>(
    `SELECT trade_date::text AS date, open::float8 AS open, high::float8 AS high,
            low::float8 AS low, close::float8 AS close, traded_qty::float8 AS volume
     FROM adjusted.daily_bar
     WHERE security_id = $1
       AND trade_date >= (SELECT max(trade_date) FROM adjusted.daily_bar) - make_interval(months => $2)
     ORDER BY trade_date`,
    [securityId, RANGE_MONTHS[range]],
  );
  return { symbol, bars: rows };
}
