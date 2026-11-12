import type { Db } from "./db";

export interface BuildOptions {
  startDate: string;
}

/** Trimmed text, with NSE's "no value" markers (blank, "-") as NULL. */
const val = (col: string) => `NULLIF(NULLIF(btrim(${col}), ''), '-')`;

/**
 * Rebuilds core.daily_bar from scratch out of staged.bhavcopy_row, in one
 * transaction. Daily Bars are derived and unadjusted: nothing is edited in
 * place, so running it again always reproduces the same bars.
 */
export async function build(db: Db, opts: BuildOptions): Promise<{ bars: number }> {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await client.query("TRUNCATE core.daily_bar");
    const res = await client.query(
      `INSERT INTO core.daily_bar
         (symbol, trade_date, series, prev_close, open, high, low, last, close,
          avg_price, traded_qty, turnover_lacs, trades, delivery_qty, delivery_pct)
       SELECT btrim(symbol),
              to_date(btrim(date1), 'DD-Mon-YYYY'),
              btrim(series),
              ${val("prev_close")}::numeric,
              ${val("open_price")}::numeric,
              ${val("high_price")}::numeric,
              ${val("low_price")}::numeric,
              ${val("last_price")}::numeric,
              ${val("close_price")}::numeric,
              ${val("avg_price")}::numeric,
              ${val("ttl_trd_qnty")}::bigint,
              ${val("turnover_lacs")}::numeric,
              ${val("no_of_trades")}::bigint,
              ${val("deliv_qty")}::bigint,
              ${val("deliv_per")}::numeric
       FROM staged.bhavcopy_row
       WHERE btrim(series) IN ('EQ', 'BE')
         AND to_date(btrim(date1), 'DD-Mon-YYYY') >= $1::date`,
      [opts.startDate],
    );
    await client.query("COMMIT");
    return { bars: res.rowCount ?? 0 };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
