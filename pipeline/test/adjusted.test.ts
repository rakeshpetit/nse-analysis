import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "../src/build";
import { START_DATE } from "../src/config";
import { load } from "../src/load";
import { createTestDb, type TestDb } from "./testDb";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const filesDir = path.join(fixtures, "adjust");
const referenceDir = path.join(fixtures, "reference");
const startDate = START_DATE;

let t: TestDb;
let result: Awaited<ReturnType<typeof build>>;
beforeAll(async () => {
  t = await createTestDb();
  await load(t.db, { filesDir, startDate });
  result = await build(t.db, { startDate, referenceDir });
});
afterAll(async () => {
  await t.drop();
});

interface Bar {
  close: string;
  traded_qty: string;
}

/** One Security's Adjusted bar on a Trading Day (numerics as strings, as pg returns them). */
const adjustedBar = async (symbol: string, date: string): Promise<Bar | undefined> =>
  (
    await t.db.query<Bar>(
      "SELECT close, traded_qty FROM adjusted.daily_bar WHERE symbol = $1 AND trade_date = $2",
      [symbol, date],
    )
  ).rows[0];

describe("Adjusted layer", () => {
  it("divides prices and multiplies quantities by a bonus's factor before its ex-date", async () => {
    // RELIANCE bonus 1:1, ex-date 28-Oct-2024 -> factor 2
    const bar = await adjustedBar("RELIANCE", "2024-10-25");
    expect(Number(bar!.close)).toBeCloseTo(1327.85, 2);
    expect(Number(bar!.traded_qty)).toBe(2_000_000);
  });

  it("counts a bonus listed twice by NSE once", async () => {
    // HDFCBANK bonus 1:1, ex-date 26-Aug-2025 -> factor 2, not 4
    const { rows } = await t.db.query(
      "SELECT factor FROM adjusted.adjustment_factor WHERE symbol = 'HDFCBANK' AND ex_date = '2025-08-26'",
    );
    expect(rows.map((r) => Number(r.factor))).toEqual([2]);
    const before = await adjustedBar("HDFCBANK", "2025-08-25");
    expect(Number(before!.close)).toBeCloseTo(990, 2);
    expect(Number(before!.traded_qty)).toBe(1_000_000);
  });

  it("multiplies actions on the same ex-date together", async () => {
    // BAJFINANCE bonus 4:1 (x5) plus split 2 -> 1 (x2) on 16-Jun-2025 -> factor 10
    const { rows } = await t.db.query(
      "SELECT factor FROM adjusted.adjustment_factor WHERE symbol = 'BAJFINANCE' AND ex_date = '2025-06-16'",
    );
    expect(rows.map((r) => Number(r.factor))).toEqual([10]);
    const before = await adjustedBar("BAJFINANCE", "2025-06-13");
    expect(Number(before!.close)).toBeCloseTo(890, 2);
    expect(Number(before!.traded_qty)).toBe(10_000_000);
  });

  it("skips and reports a Corporate Action with no Action Interpretation, leaving prices alone", async () => {
    expect(result.skippedActions).toContainEqual({
      symbol: "UNKNOWNCO",
      exDate: "2024-10-29",
      description: "Bonus 7:3",
      reason: "no Action Interpretation for this description",
    });
    expect(Number((await adjustedBar("UNKNOWNCO", "2024-10-28"))!.close)).toBe(200);
  });

  it("reports an interpretation of a type not supported yet, and nothing else it should not", async () => {
    // Out-of-window OLDCO, price-irrelevant NOPRICE and the 'no ex-date' entry are not reported.
    expect(result.skippedActions.map((a) => a.symbol).sort()).toEqual(["RIGHTSCO", "UNKNOWNCO"]);
    expect(Number((await adjustedBar("RIGHTSCO", "2024-10-25"))!.close)).toBe(400);
  });

  it("leaves a price-irrelevant Corporate Action's bars unadjusted", async () => {
    expect(Number((await adjustedBar("NOPRICE", "2024-10-25"))!.close)).toBe(300);
  });

  it("adjusts bars before a non-Trading-Day ex-date, and not the first Trading Day after it", async () => {
    // SUNEX bonus 1:1, ex-date Sunday 03-Nov-2024
    expect(Number((await adjustedBar("SUNEX", "2024-11-01"))!.close)).toBe(40);
    expect(Number((await adjustedBar("SUNEX", "2024-11-04"))!.close)).toBe(41);
  });

  it("inverts a consolidation: prices go up and quantities down", async () => {
    // CONSOLCO face value Re 1 -> Rs 10, ex-date 30-Oct-2024 -> factor 1/10
    const bar = await adjustedBar("CONSOLCO", "2024-10-29");
    expect(Number(bar!.close)).toBe(200);
    expect(Number(bar!.traded_qty)).toBe(10_000);
  });

  it("uses only the latest Reference Snapshot", async () => {
    // The older snapshot lists a GAPCO bonus the latest one dropped.
    expect(Number((await adjustedBar("GAPCO", "2024-10-25"))!.close)).toBe(51);
  });

  it("leaves turnover, trades and delivery % as traded, and scales delivery quantity", async () => {
    const { rows } = await t.db.query(
      `SELECT a.turnover_lacs = b.turnover_lacs AS turnover, a.trades = b.trades AS trades,
              a.delivery_pct = b.delivery_pct AS pct, a.delivery_qty AS delivery_qty,
              a.avg_price AS avg_price, a.prev_close AS prev_close
       FROM adjusted.daily_bar a JOIN core.daily_bar b USING (symbol, trade_date)
       WHERE symbol = 'RELIANCE' AND trade_date = '2024-10-25'`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ turnover: true, trades: true, pct: true });
    expect(Number(rows[0].delivery_qty)).toBe(800_000);
    expect(Number(rows[0].avg_price)).toBeCloseTo(1327.85, 2);
    expect(Number(rows[0].prev_close)).toBeCloseTo(1341.13, 2);
  });

  it("keeps missing days missing and missing values missing", async () => {
    const { rows } = await t.db.query(
      `SELECT (SELECT count(*) FROM adjusted.daily_bar) AS adjusted, (SELECT count(*) FROM core.daily_bar) AS core`,
    );
    expect(rows[0].adjusted).toBe(rows[0].core);
    const gap = await t.db.query(
      "SELECT trade_date::text, avg_price FROM adjusted.daily_bar WHERE symbol = 'GAPCO' ORDER BY trade_date",
    );
    expect(gap.rows.map((r) => [r.trade_date, r.avg_price === null ? null : Number(r.avg_price)])).toEqual([
      ["2024-10-25", null],
      ["2024-10-30", 52],
    ]);
  });

  it("never changes Daily Bars", async () => {
    const { rows } = await t.db.query(
      "SELECT close, traded_qty FROM core.daily_bar WHERE symbol = 'RELIANCE' AND trade_date = '2024-10-25'",
    );
    expect(rows).toEqual([{ close: "2655.70", traded_qty: "1000000" }]);
  });

  it("is rebuilt from scratch: running build again gives the same layer", async () => {
    const snapshot = () =>
      t.db
        .query("SELECT * FROM adjusted.daily_bar ORDER BY symbol, trade_date")
        .then((r) => r.rows);
    const before = await snapshot();
    const again = await build(t.db, { startDate, referenceDir });
    expect(await snapshot()).toEqual(before);
    expect(again.skippedActions).toEqual(result.skippedActions);
  });

});
