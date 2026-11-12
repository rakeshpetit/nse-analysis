import { withTransaction, type Db } from "./db";

export interface BuildOptions {
  startDate: string;
}

/** Trimmed text, with NSE's "no value" markers (blank, "-") as NULL. */
const nullIfBlank = (col: string) => `NULLIF(NULLIF(btrim(${col}), ''), '-')`;

/**
 * Rebuilds core.daily_bar from scratch out of staged.bhavcopy_row, in one
 * transaction. Daily Bars are derived and unadjusted: nothing is edited in
 * place, so running it again always reproduces the same bars.
 */
export async function build(db: Db, opts: BuildOptions): Promise<{ bars: number }> {
  return withTransaction(db, async (client) => {
    await client.query("TRUNCATE core.daily_bar");
    const res = await client.query(
      `INSERT INTO core.daily_bar
         (symbol, trade_date, series, prev_close, open, high, low, last, close,
          avg_price, traded_qty, turnover_lacs, trades, delivery_qty, delivery_pct)
       SELECT btrim(symbol),
              to_date(btrim(date1), 'DD-Mon-YYYY'),
              btrim(series),
              ${nullIfBlank("prev_close")}::numeric,
              ${nullIfBlank("open_price")}::numeric,
              ${nullIfBlank("high_price")}::numeric,
              ${nullIfBlank("low_price")}::numeric,
              ${nullIfBlank("last_price")}::numeric,
              ${nullIfBlank("close_price")}::numeric,
              ${nullIfBlank("avg_price")}::numeric,
              ${nullIfBlank("ttl_trd_qnty")}::bigint,
              ${nullIfBlank("turnover_lacs")}::numeric,
              ${nullIfBlank("no_of_trades")}::bigint,
              ${nullIfBlank("deliv_qty")}::bigint,
              ${nullIfBlank("deliv_per")}::numeric
       FROM staged.bhavcopy_row
       WHERE btrim(series) IN ('EQ', 'BE')
         AND to_date(btrim(date1), 'DD-Mon-YYYY') >= $1::date`,
      [opts.startDate],
    );
    return { bars: res.rowCount ?? 0 };
  });
}
