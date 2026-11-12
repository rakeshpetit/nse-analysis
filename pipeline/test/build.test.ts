import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "../src/build";
import { load } from "../src/load";
import { START_DATE } from "../src/config";
import { createTestDb, type TestDb } from "./testDb";

const filesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/raw");
const startDate = START_DATE;

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await load(t.db, { filesDir, startDate });
  await build(t.db, { startDate });
});
afterAll(async () => {
  await t.drop();
});

const bars = (where = "true") =>
  t.db
    .query(
      `SELECT symbol, trade_date::text AS trade_date, series, prev_close, open, high, low,
              last, close, avg_price, traded_qty, turnover_lacs, trades, delivery_qty, delivery_pct
       FROM core.daily_bar WHERE ${where} ORDER BY symbol, trade_date`,
    )
    .then((r) => r.rows);

describe("build", () => {
  it("turns Staged Rows into typed Daily Bars whose values match the Raw File exactly", async () => {
    expect(await bars("symbol = 'RELIANCE'")).toEqual([
      {
        symbol: "RELIANCE",
        trade_date: "2024-09-02",
        series: "EQ",
        prev_close: "3019.25",
        open: "3021.75",
        high: "3053.60",
        low: "3013.25",
        last: "3034.40",
        close: "3032.50",
        avg_price: "3034.10",
        traded_qty: "5620426",
        turnover_lacs: "170529.33",
        trades: "280541",
        delivery_qty: "3403958",
        delivery_pct: "60.56",
      },
      {
        symbol: "RELIANCE",
        trade_date: "2024-09-03",
        series: "EQ",
        prev_close: "3032.50",
        open: "3042.50",
        high: "3046.00",
        low: "3015.00",
        last: "3018.90",
        close: "3018.25",
        avg_price: "3026.09",
        traded_qty: "5461900",
        turnover_lacs: "165281.93",
        trades: "226578",
        delivery_qty: "3988825",
        delivery_pct: "73.03",
      },
    ]);
  });

  it("builds bars for the EQ and BE series only, storing the series on the bar", async () => {
    const day = await bars("trade_date = '2024-09-02'");
    expect(day.map((b) => [b.symbol, b.series])).toEqual([
      ["21STCENMGM", "BE"],
      ["RELIANCE", "EQ"],
      ["TCS", "EQ"],
    ]); // 1018GS2026 (series GS) is left out
  });

  it("builds bars only for Trading Days on or after the start date", async () => {
    // A staged row whose in-file date is before the start date (e.g. a stray file).
    await t.db.query(
      `INSERT INTO staged.bhavcopy_row
         (source_file, line_number, symbol, series, date1, prev_close, open_price, high_price,
          low_price, last_price, close_price, avg_price, ttl_trd_qnty, turnover_lacs,
          no_of_trades, deliv_qty, deliv_per)
       VALUES ('stray.csv', 2, 'RELIANCE', ' EQ', ' 30-Aug-2024', ' 1', ' 1', ' 1', ' 1', ' 1',
               ' 1', ' 1', ' 1', ' 1', ' 1', ' 1', ' 1')`,
    );
    await build(t.db, { startDate });
    expect((await bars("symbol = 'RELIANCE'")).map((b) => b.trade_date)).toEqual([
      "2024-09-02",
      "2024-09-03",
    ]);
  });

  it("stores NSE's '-' placeholders as NULL rather than failing or inventing a value", async () => {
    const [bar] = await bars("symbol = '21STCENMGM'");
    expect(bar).toMatchObject({ series: "BE", traded_qty: "5714", delivery_qty: null, delivery_pct: null });
  });

  it("is safe to re-run: building twice gives the same Daily Bars", async () => {
    const before = await bars();
    await build(t.db, { startDate });
    expect(await bars()).toEqual(before);
  });
});
