import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { load } from "../src/load";
import { START_DATE } from "../src/config";
import { createTestDb, type TestDb } from "./testDb";

const filesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/raw");
const startDate = START_DATE;

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.drop();
});
beforeEach(async () => {
  await t.db.query("TRUNCATE staged.bhavcopy_row");
});

describe("load", () => {
  it("stages a Raw File line as received, traceable to its file and line", async () => {
    await load(t.db, { filesDir, startDate });

    const { rows } = await t.db.query(
      `SELECT * FROM staged.bhavcopy_row
       WHERE source_file = '2024/SEP/02SEP2024.csv' AND symbol = 'RELIANCE'`,
    );
    expect(rows).toEqual([
      {
        source_file: "2024/SEP/02SEP2024.csv",
        line_number: 4, // header is line 1
        symbol: "RELIANCE",
        series: " EQ",
        date1: " 02-Sep-2024",
        prev_close: " 3019.25",
        open_price: " 3021.75",
        high_price: " 3053.60",
        low_price: " 3013.25",
        last_price: " 3034.40",
        close_price: " 3032.50",
        avg_price: " 3034.10",
        ttl_trd_qnty: " 5620426",
        turnover_lacs: " 170529.33",
        no_of_trades: " 280541",
        deliv_qty: " 3403958",
        deliv_per: " 60.56",
      },
    ]);
  });

  it("skips Raw Files from before the start date", async () => {
    await load(t.db, { filesDir, startDate });

    const { rows } = await t.db.query(
      "SELECT DISTINCT source_file FROM staged.bhavcopy_row ORDER BY source_file",
    );
    expect(rows.map((r) => r.source_file)).toEqual([
      "2024/SEP/02SEP2024.csv",
      "2024/SEP/03SEP2024.csv",
    ]);
  });

  it("is safe to re-run: loading the same files twice gives the same Staged Rows", async () => {
    const snapshot = () =>
      t.db
        .query("SELECT * FROM staged.bhavcopy_row ORDER BY source_file, line_number")
        .then((r) => r.rows);

    await load(t.db, { filesDir, startDate });
    const first = await snapshot();
    await load(t.db, { filesDir, startDate });
    const second = await snapshot();

    expect(first).toHaveLength(5); // 4 + 1 data rows in the two September files
    expect(second).toEqual(first);
  });
});
