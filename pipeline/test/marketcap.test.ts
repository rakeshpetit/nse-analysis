import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "../src/build";
import { START_DATE } from "../src/config";
import { load } from "../src/load";
import { marketCapMismatches } from "../src/review";
import { createTestDb, type TestDb } from "./testDb";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/marketcap");

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await load(t.db, { filesDir: path.join(fixtures, "files"), startDate: START_DATE });
  await build(t.db, { startDate: START_DATE, referenceDir: path.join(fixtures, "reference") });
});
afterAll(async () => {
  await t.drop();
});

describe("load", () => {
  it("stages every line of a Market Cap File as received, totals included, traceable to its file and line", async () => {
    const { rows } = await t.db.query(
      `SELECT * FROM staged.mcap_row WHERE source_file = 'mcap/2026/NOV/11NOV2026.csv' AND btrim(symbol) IN ('TCS', 'Total')
       ORDER BY line_number`,
    );

    expect(rows).toEqual([
      {
        source_file: "mcap/2026/NOV/11NOV2026.csv",
        line_number: 4, // header is line 1
        trade_date: "11 NOV 2026",
        symbol: "TCS       ",
        series: "BE",
        security_name: "Tata Consultancy    ",
        category: "Equity",
        last_trade_date: "11 NOV 2026",
        face_value: " 5.00",
        issue_size: "  3000000000",
        close_price: "   3000.00",
        market_cap: "  9000000000000.00",
      },
      expect.objectContaining({ line_number: 12, symbol: "Total     ", series: "" }),
    ]);
  });

  it("does not stage a Market Cap File as a bhavcopy", async () => {
    const { rows } = await t.db.query("SELECT DISTINCT source_file FROM staged.bhavcopy_row ORDER BY 1");

    expect(rows.map((r) => r.source_file)).toEqual(["2026/NOV/10NOV2026.csv", "2026/NOV/11NOV2026.csv"]);
  });
});

describe("build: Issue Size", () => {
  it("records the Issue Size of each EQ and BE Security on a Trading Day, and nothing else", async () => {
    const { rows } = await t.db.query(
      "SELECT symbol, trade_date::text, issue_size::text FROM core.issue_size WHERE trade_date = '2026-11-11' ORDER BY symbol",
    );

    expect(rows).toEqual([
      { symbol: "HCLTECH", trade_date: "2026-11-11", issue_size: "2000000000" },
      { symbol: "INFY", trade_date: "2026-11-11", issue_size: "4000000000" },
      { symbol: "NEWCO", trade_date: "2026-11-11", issue_size: "50000000" },
      { symbol: "RELIANCE", trade_date: "2026-11-11", issue_size: "10000000000" },
      { symbol: "TCS", trade_date: "2026-11-11", issue_size: "3000000000" },
      { symbol: "WIPRO", trade_date: "2026-11-11", issue_size: "5000000000" },
    ]); // no SM series, no totals lines (Listed, Permitted, Total), no symbol that never traded
  });

  it("follows a Security across a rename, as Daily Bars do", async () => {
    const { rows } = await t.db.query(
      `SELECT i.symbol, i.trade_date::text, i.security_id = b.security_id AS same_as_bar
       FROM core.issue_size i JOIN core.daily_bar b USING (symbol, trade_date)
       WHERE i.symbol IN ('OLDCO', 'NEWCO') ORDER BY i.trade_date`,
    );
    const ids = await t.db.query("SELECT DISTINCT security_id FROM core.issue_size WHERE symbol IN ('OLDCO', 'NEWCO')");

    expect(rows).toEqual([
      { symbol: "OLDCO", trade_date: "2026-11-10", same_as_bar: true },
      { symbol: "NEWCO", trade_date: "2026-11-11", same_as_bar: true },
    ]);
    expect(ids.rows).toHaveLength(1);
  });

  it("gives every EQ and BE Security in the Market Cap File an Issue Size for that day", async () => {
    const { rows } = await t.db.query(
      `SELECT b.symbol FROM core.daily_bar b
       WHERE b.trade_date = '2026-11-11' AND b.series IN ('EQ', 'BE')
         AND NOT EXISTS (SELECT 1 FROM core.issue_size i WHERE i.security_id = b.security_id AND i.trade_date = b.trade_date)`,
    );

    expect(rows).toEqual([]);
  });
});

describe("review: Market Cap mismatches", () => {
  it("lists Security-days where Issue Size × unadjusted close is more than 0.5% from the file's Market Cap", async () => {
    const mismatches = await marketCapMismatches(t.db);

    // WIPRO is 0.4% off, so it is not listed; HCLTECH is 0.6% off
    expect(mismatches).toEqual([
      expect.objectContaining({ symbol: "HCLTECH", tradeDate: "2026-11-11" }),
      expect.objectContaining({
        symbol: "RELIANCE",
        tradeDate: "2026-11-11",
        issueSize: "10000000000",
        close: "1000.00",
        marketCap: "10000000000000.00",
        fileMarketCap: "11000000000000.00",
      }),
    ]);
  });
});
