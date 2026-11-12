import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { openDb, topSecurities } from "../app/data.server";
import { createTestDb, seedBar, seedIssueSize, type TestDb } from "./testDb";

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
    "TRUNCATE core.daily_bar, adjusted.daily_bar, core.issue_size, core.security CASCADE",
  );
});

const DAY = "2026-11-12";

describe("topSecurities", () => {
  it("ranks Securities by Market Cap in ₹ crore, with the latest close and the 1-day % change", async () => {
    // Market Cap = Issue Size × unadjusted close ÷ 1 crore (10,000,000)
    await seedBar(t.writer, { id: "SMALL", date: DAY, close: 100, adjClose: 100, adjPrevClose: 80 });
    await seedIssueSize(t.writer, "SMALL", DAY, 10_000_000); // 100 Cr
    await seedBar(t.writer, { id: "BIG", date: DAY, close: 2_000, adjClose: 2_000, adjPrevClose: 2_500 });
    await seedIssueSize(t.writer, "BIG", DAY, 50_000_000); // 10,000 Cr

    const result = await topSecurities(db);

    expect(result).toEqual({
      tradeDate: DAY,
      securities: [
        { rank: 1, symbol: "BIG", marketCapCr: 10_000, close: 2_000, changePct: -20 },
        { rank: 2, symbol: "SMALL", marketCapCr: 100, close: 100, changePct: 25 },
      ],
    });
  });

  it("still ranks a Security missing from the latest Market Cap File, using its most recent earlier Issue Size", async () => {
    await seedBar(t.writer, { id: "CARRIED", date: DAY, close: 10 });
    await seedIssueSize(t.writer, "CARRIED", "2026-11-09", 1_000_000_000); // 1,000 Cr
    await seedIssueSize(t.writer, "CARRIED", "2026-11-10", 2_000_000_000); // 2,000 Cr: the latest on or before DAY
    await seedBar(t.writer, { id: "FRESH", date: DAY, close: 10 });
    await seedIssueSize(t.writer, "FRESH", DAY, 1_500_000_000); // 1,500 Cr

    const { securities } = await topSecurities(db);

    expect(securities.map((s) => [s.symbol, s.marketCapCr])).toEqual([
      ["CARRIED", 2_000],
      ["FRESH", 1_500],
    ]);
  });

  it("ignores an Issue Size dated after the latest Trading Day", async () => {
    await seedBar(t.writer, { id: "A", date: DAY, close: 10 });
    await seedIssueSize(t.writer, "A", DAY, 1_000_000_000); // 1,000 Cr
    await seedIssueSize(t.writer, "A", "2026-11-13", 9_000_000_000);

    const { securities } = await topSecurities(db);

    expect(securities.map((s) => s.marketCapCr)).toEqual([1_000]);
  });

  it("does not rank a Security with no Daily Bar on the latest Trading Day", async () => {
    await seedBar(t.writer, { id: "TRADED", date: DAY, close: 10 });
    await seedIssueSize(t.writer, "TRADED", DAY, 1_000_000);
    await seedBar(t.writer, { id: "HALTED", date: "2026-11-11", close: 10 });
    await seedIssueSize(t.writer, "HALTED", DAY, 9_000_000_000); // bigger, but it did not trade on DAY

    const { tradeDate, securities } = await topSecurities(db);

    expect(tradeDate).toBe(DAY);
    expect(securities.map((s) => s.symbol)).toEqual(["TRADED"]);
  });

  it("does not rank a Security that has no Issue Size at all", async () => {
    await seedBar(t.writer, { id: "NOSIZE", date: DAY, close: 10 });

    const { securities } = await topSecurities(db);

    expect(securities).toEqual([]);
  });

  it("returns only the 30 largest", async () => {
    for (let n = 1; n <= 31; n++) {
      const id = `S${String(n).padStart(2, "0")}`;
      await seedBar(t.writer, { id, date: DAY, close: 10 });
      await seedIssueSize(t.writer, id, DAY, n * 1_000_000);
    }

    const { securities } = await topSecurities(db);

    expect(securities).toHaveLength(30);
    expect(securities[0]).toMatchObject({ rank: 1, symbol: "S31" });
    expect(securities[29]).toMatchObject({ rank: 30, symbol: "S02" });
  });

  it("has no change % when the previous close is zero", async () => {
    await seedBar(t.writer, { id: "NEW", date: DAY, close: 10, adjPrevClose: 0 });
    await seedIssueSize(t.writer, "NEW", DAY, 1_000_000);

    const { securities } = await topSecurities(db);

    expect(securities[0]?.changePct).toBeNull();
  });

  it("returns nothing, not an error, when there is no data yet", async () => {
    expect(await topSecurities(db)).toEqual({ tradeDate: null, securities: [] });
  });

  it("returns nothing when there are Daily Bars but no Issue Size data", async () => {
    await seedBar(t.writer, { id: "A", date: DAY, close: 10 });

    expect((await topSecurities(db)).securities).toEqual([]);
  });
});

describe("openDb", () => {
  it("refuses writes", async () => {
    await expect(db.query("INSERT INTO core.security (security_id) VALUES ('X')")).rejects.toThrow(
      /read-only transaction/,
    );
  });
});
