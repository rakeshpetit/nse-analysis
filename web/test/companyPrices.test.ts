import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { companyPrices, openDb } from "../app/data.server";
import type { Range } from "../app/ranges";
import { createTestDb, seedBar, seedName, seedSymbolHistory, type TestDb } from "./testDb";

let t: TestDb;
let db: ReturnType<typeof openDb>;
beforeAll(async () => {
  t = await createTestDb();
  db = openDb(t.url);
});
afterAll(async () => {
  await db.end();
  await t.drop();
});
afterEach(async () => {
  await t.writer.query(
    "TRUNCATE core.daily_bar, adjusted.daily_bar, core.security_symbol, core.security_name, core.security CASCADE",
  );
});

describe("companyPrices: name", () => {
  it("is the Security's company name", async () => {
    await seedSymbolHistory(t.writer, "ID1", [{ symbol: "ABC" }]);
    await seedName(t.writer, "ID1", "Abc Industries Limited");

    expect((await companyPrices(db, "ABC", "1Y"))?.name).toBe("Abc Industries Limited");
  });

  it("falls back to the symbol where no name is known", async () => {
    await seedSymbolHistory(t.writer, "ID1", [{ symbol: "ABC" }]);

    expect((await companyPrices(db, "ABC", "1Y"))?.name).toBe("ABC");
  });
});

describe("companyPrices: symbol → Security", () => {
  it("is null for a symbol no Security currently trades under", async () => {
    await seedSymbolHistory(t.writer, "ID1", [{ symbol: "KNOWN" }]);
    await seedBar(t.writer, { id: "ID1", symbol: "KNOWN", date: "2026-11-12", close: 10 });

    expect(await companyPrices(db, "NOPE", "1Y")).toBeNull();
  });

  it("draws bars from before and after a rename under the current symbol", async () => {
    await seedSymbolHistory(t.writer, "ID1", [
      { symbol: "OLD", to: "2026-11-10" },
      { symbol: "NEW", from: "2026-11-10" },
    ]);
    await seedBar(t.writer, { id: "ID1", symbol: "OLD", date: "2026-11-09", close: 10, adjClose: 11 });
    await seedBar(t.writer, { id: "ID1", symbol: "NEW", date: "2026-11-10", close: 12, adjClose: 12 });

    const result = await companyPrices(db, "NEW", "1Y");

    expect(result?.symbol).toBe("NEW");
    expect(result?.bars.map((b) => [b.date, b.close])).toEqual([
      ["2026-11-09", 11],
      ["2026-11-10", 12],
    ]);
  });

  it("does not resolve a retired symbol", async () => {
    await seedSymbolHistory(t.writer, "ID1", [
      { symbol: "OLD", to: "2026-11-10" },
      { symbol: "NEW", from: "2026-11-10" },
    ]);
    await seedBar(t.writer, { id: "ID1", symbol: "NEW", date: "2026-11-10", close: 12 });

    expect(await companyPrices(db, "OLD", "1Y")).toBeNull();
  });
});

describe("companyPrices: range windows", () => {
  async function seedDays(id: string, symbol: string, dates: string[]) {
    await seedSymbolHistory(t.writer, id, [{ symbol }]);
    for (const date of dates) await seedBar(t.writer, { id, symbol, date, close: 10 });
  }
  const dates = async (symbol: string, range: Range) =>
    (await companyPrices(db, symbol, range))?.bars.map((b) => b.date);

  const HISTORY = [
    "2025-10-01",
    "2025-11-11",
    "2025-11-12",
    "2026-05-11",
    "2026-05-12",
    "2026-08-11",
    "2026-08-12",
    "2026-11-12",
  ];

  it("counts calendar months back from the latest Trading Day, inclusive of that date", async () => {
    await seedDays("A", "A", HISTORY);

    expect(await dates("A", "3M")).toEqual(["2026-08-12", "2026-11-12"]);
    expect(await dates("A", "6M")).toEqual(["2026-05-12", "2026-08-11", "2026-08-12", "2026-11-12"]);
    expect(await dates("A", "1Y")).toEqual([
      "2025-11-12",
      "2026-05-11",
      "2026-05-12",
      "2026-08-11",
      "2026-08-12",
      "2026-11-12",
    ]);
  });

  it("measures from the latest Trading Day in the database, not the Security's own last bar", async () => {
    await seedDays("STALE", "STALE", ["2026-06-01", "2026-08-01"]); // stopped trading
    await seedDays("LIVE", "LIVE", ["2026-11-12"]);

    expect(await dates("STALE", "3M")).toEqual([]); // 3M back from 2026-11-12 is 2026-08-12
    expect(await dates("STALE", "6M")).toEqual(["2026-06-01", "2026-08-01"]);
  });

  it("shows what a young Security has, without padding", async () => {
    await seedDays("YOUNG", "YOUNG", ["2026-11-11", "2026-11-12"]);

    expect(await dates("YOUNG", "1Y")).toEqual(["2026-11-11", "2026-11-12"]);
  });

  it("clamps a month-end start to the shorter month", async () => {
    await seedDays("A", "A", ["2026-02-27", "2026-02-28", "2026-08-31"]);

    expect(await dates("A", "6M")).toEqual(["2026-02-28", "2026-08-31"]); // Aug 31 − 6 months → Feb 28
  });
});

describe("companyPrices: bar contents", () => {
  it("returns the Adjusted open, high, low and close, not the unadjusted ones", async () => {
    await seedSymbolHistory(t.writer, "A", [{ symbol: "A" }]);
    await seedBar(t.writer, { id: "A", date: "2026-11-12", close: 100, adjClose: 25, qty: 1000, adjQty: 4000 });
    await t.writer.query("UPDATE adjusted.daily_bar SET open = 24, high = 26, low = 23");

    expect((await companyPrices(db, "A", "3M"))?.bars).toEqual([
      { date: "2026-11-12", open: 24, high: 26, low: 23, close: 25, volume: 4000 },
    ]);
  });

  it("gives each day's Adjusted traded quantity, so volume has no step at a split's ex-date", async () => {
    await seedSymbolHistory(t.writer, "A", [{ symbol: "A" }]);
    // 1:4 split with ex-date 2026-11-12: the unadjusted quantity quadruples, the Adjusted one does not.
    await seedBar(t.writer, { id: "A", date: "2026-11-11", close: 100, adjClose: 25, qty: 1000, adjQty: 4000 });
    await seedBar(t.writer, { id: "A", date: "2026-11-12", close: 25, qty: 4000, adjQty: 4000 });

    expect((await companyPrices(db, "A", "3M"))?.bars.map((b) => b.volume)).toEqual([4000, 4000]);
  });
});
