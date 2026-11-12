import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { build } from "../src/build";
import { load } from "../src/load";
import { START_DATE } from "../src/config";
import { createTestDb, type TestDb } from "./testDb";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/messy");
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

const loadAndBuild = async (dir: string) => {
  await load(t.db, { filesDir: path.join(fixtures, dir), startDate });
  return build(t.db, { startDate });
};

const bars = () =>
  t.db
    .query("SELECT symbol, trade_date::text AS trade_date, close FROM core.daily_bar ORDER BY 1, 2")
    .then((r) => r.rows);

describe("messy Raw Files", () => {
  it("keys Daily Bars by the Trading Day inside the file, not the file name", async () => {
    await loadAndBuild("duplicate");
    // 02OCT2024.csv holds 1-Oct data
    expect(await bars()).toContainEqual({
      symbol: "RELIANCE",
      trade_date: "2024-10-01",
      close: "2945.00",
    });
    expect((await bars()).map((b) => b.trade_date)).not.toContain("2024-10-02");
  });

  it("collapses a holiday-named duplicate into one set of Daily Bars", async () => {
    await loadAndBuild("duplicate"); // 08SEP2024.csv is a copy of 05SEP2024.csv
    expect(await bars()).toEqual([
      { symbol: "RELIANCE", trade_date: "2024-09-05", close: "3012.50" },
      { symbol: "RELIANCE", trade_date: "2024-10-01", close: "2945.00" },
      { symbol: "TCS", trade_date: "2024-09-05", close: "4545.00" },
    ]);
  });

  it("fails when files for the same Trading Day disagree, naming both files and the differing row", async () => {
    const err = await loadAndBuild("conflict").catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    const message = (err as Error).message;
    expect(message).toContain("2024-09-05");
    expect(message).toContain("05SEP2024.csv");
    expect(message).toContain("08SEP2024.csv");
    expect(message).toContain("RELIANCE");
    expect(message).toContain("close_price");
    expect(message).toContain("3012.50");
    expect(message).toContain("3013.75");
  });

  it("fails when one file repeats a row with different values", async () => {
    await expect(loadAndBuild("samefile")).rejects.toThrow(/05SEP2024\.csv:2 vs .*05SEP2024\.csv:3/);
  });

  it("leaves existing Daily Bars untouched when the load conflicts", async () => {
    await loadAndBuild("duplicate");
    const before = await bars();
    await t.db.query("TRUNCATE staged.bhavcopy_row");
    await expect(loadAndBuild("conflict")).rejects.toThrow();
    expect(await bars()).toEqual(before);
  });

  it("loads the unquoted, space-padded 04SEP2024 variant like any other file", async () => {
    await loadAndBuild("quoting");
    expect(await bars()).toEqual([
      { symbol: "20MICRONS", trade_date: "2024-09-04", close: "327.20" },
      { symbol: "RELIANCE", trade_date: "2024-09-04", close: "3018.25" },
    ]);
  });
});
