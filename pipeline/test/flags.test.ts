import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "../src/build";
import { START_DATE } from "../src/config";
import { load } from "../src/load";
import { createTestDb, type TestDb } from "./testDb";

const filesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/flags");
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

/** Quality Flag names carried by each symbol's Daily Bar, sorted. */
const flagsBySymbol = () =>
  t.db
    .query<{ symbol: string; flags: string[] }>(
      `SELECT b.symbol, coalesce(array_agg(f.flag ORDER BY f.flag) FILTER (WHERE f.flag IS NOT NULL), '{}') AS flags
       FROM core.daily_bar b
       LEFT JOIN core.daily_bar_flag f USING (symbol, trade_date)
       GROUP BY b.symbol ORDER BY b.symbol`,
    )
    .then((r) => Object.fromEntries(r.rows.map((x) => [x.symbol, x.flags])));

describe("Quality Flags", () => {
  it("flags a bar whose high is below its low", async () => {
    expect((await flagsBySymbol()).HILOCO).toEqual(["high_below_low"]);
  });

  it("flags open, close and last outside the high-low range, each under its own name", async () => {
    const flags = await flagsBySymbol();
    expect(flags.OPENOUT).toEqual(["open_outside_range"]);
    expect(flags.CLOSEOUT).toEqual(["close_outside_range"]);
    expect(flags.LASTOUT).toEqual(["last_outside_range"]);
  });

  it("lets one bar carry several flags", async () => {
    expect((await flagsBySymbol()).MULTI).toEqual(["close_outside_range", "open_outside_range"]);
  });

  it("flags zero traded quantity with a non-zero price, but not an all-zero bar", async () => {
    const flags = await flagsBySymbol();
    expect(flags.ZEROQTY).toEqual(["zero_qty_nonzero_price"]);
    expect(flags.ALLZERO).toEqual([]);
  });

  it("keeps flagged bars and leaves plausible bars unflagged", async () => {
    const flags = await flagsBySymbol();
    expect(Object.keys(flags)).toHaveLength(8); // nothing deleted
    expect(flags.CLEANCO).toEqual([]);
  });

  it("gives the same flags when build is run again", async () => {
    const before = await flagsBySymbol();
    await build(t.db, { startDate });
    expect(await flagsBySymbol()).toEqual(before);
  });
});
