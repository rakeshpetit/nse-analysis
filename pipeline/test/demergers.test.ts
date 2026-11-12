import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "../src/build";
import { START_DATE } from "../src/config";
import { load } from "../src/load";
import { review } from "../src/review";
import { createTestDb, type TestDb } from "./testDb";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/demerger");
const filesDir = path.join(fixtures, "bars");
const referenceDir = path.join(fixtures, "reference");

const HEADER = "decision,item,symbol,date,factor,note";

// Siemens Ltd demerged its energy business, going ex on 2025-04-07 with NSE publishing no ratio.
// Its last close before that was 4928.15 and the ex-date's open (price discovery) 2450.00.
const ESTIMATE = 4928.15 / 2450;

let t: TestDb;
const scratch: string[] = [];
beforeAll(async () => {
  t = await createTestDb();
  await load(t.db, { filesDir, startDate: START_DATE });
});
afterAll(async () => {
  await t.drop();
  await Promise.all(scratch.map((d) => fs.rm(d, { recursive: true, force: true })));
});

async function reviewDirWith(...rows: string[]): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nse-review-"));
  scratch.push(dir);
  await fs.writeFile(path.join(dir, "decisions.csv"), [HEADER, ...rows].join("\n") + "\n");
  return dir;
}

const buildWith = (reviewDir?: string) => build(t.db, { startDate: START_DATE, referenceDir, reviewDir });

const factorsOf = async (symbol: string) =>
  (await t.db.query("SELECT ex_date::text, factor FROM adjusted.adjustment_factor WHERE symbol = $1 ORDER BY ex_date", [symbol])).rows.map(
    (r) => `${r.ex_date} ${Number(r.factor).toFixed(6)}`,
  );

const adjustedClose = async (symbol: string, date: string) =>
  Number((await t.db.query("SELECT close FROM adjusted.daily_bar WHERE symbol = $1 AND trade_date = $2", [symbol, date])).rows[0].close);

const reviewItems = async (reviewDir?: string) => review(t.db, { startDate: START_DATE, referenceDir, reviewDir });

describe("an unconfirmed demerger", () => {
  it("is never applied", async () => {
    const result = await buildWith();
    expect(await factorsOf("SIEMENS")).toEqual([]);
    expect(await adjustedClose("SIEMENS", "2025-04-04")).toBe(4928.15);
    expect(result.skippedActions.filter((a) => a.symbol === "SIEMENS")).toEqual([
      expect.objectContaining({ exDate: "2025-04-07", reason: expect.stringMatching(/Review Decision/) }),
    ]);
  });

  it("is in the review queue with its estimated factor and the surrounding prices", async () => {
    await buildWith();
    const item = (await reviewItems()).find((i) => i.id === "demerger:SIEMENS:2025-04-07")!;
    expect(item.kind).toBe("demerger_estimate");
    expect(item.symbol).toBe("SIEMENS");
    expect(item.date).toBe("2025-04-07");
    expect(item.summary).toContain(ESTIMATE.toFixed(4));
    expect(item.detail.join("\n")).toContain("4928.15");
    expect(item.detail.join("\n")).toContain("2450.00");
    expect(item.prices?.map((p) => [p.tradeDate, Number(p.open), Number(p.close)])).toEqual([
      ["2025-04-03", 5201, 5248.55],
      ["2025-04-04", 5287.45, 4928.15],
      ["2025-04-07", 2450, 2812.45],
      ["2025-04-08", 2938.35, 2763.45],
    ]);
  });

  it("shows no estimate when a Security has no Daily Bar on one side of the ex-date, and still never applies it", async () => {
    await buildWith();
    const item = (await reviewItems()).find((i) => i.id === "demerger:NOBARS:2025-04-07")!;
    expect(item.summary).toMatch(/no estimate/);
    expect(await factorsOf("NOBARS")).toEqual([]);
  });
});

describe("a confirming Review Decision", () => {
  it("accepts the estimate when it gives no factor, and the next build applies it", async () => {
    const reviewDir = await reviewDirWith("confirm_demerger,,SIEMENS,2025-04-07,,Estimate matches the price discovery open");
    const result = await buildWith(reviewDir);
    expect(await factorsOf("SIEMENS")).toEqual([`2025-04-07 ${ESTIMATE.toFixed(6)}`]);
    expect(await adjustedClose("SIEMENS", "2025-04-04")).toBeCloseTo(4928.15 / ESTIMATE, 6);
    expect(await adjustedClose("SIEMENS", "2025-04-07")).toBe(2812.45);
    expect(result.skippedActions.map((a) => a.symbol)).not.toContain("SIEMENS");
    // Daily Bars stay as traded (ADR 0001)
    const { rows } = await t.db.query("SELECT close FROM core.daily_bar WHERE symbol = 'SIEMENS' AND trade_date = '2025-04-04'");
    expect(Number(rows[0].close)).toBe(4928.15);
  });

  it("is applied exactly: the estimate is the ratio of the two prices", async () => {
    const reviewDir = await reviewDirWith("confirm_demerger,,SIEMENS,2025-04-07,,");
    await buildWith(reviewDir);
    const { rows } = await t.db.query("SELECT factor_num, factor_den FROM adjusted.adjustment_factor WHERE symbol = 'SIEMENS'");
    // 4928.15 / 2450 = 492815 / 245000 = 98563 / 49000
    expect([rows[0].factor_num, rows[0].factor_den]).toEqual(["98563", "49000"]);
  });

  it("can name the demerger by the ID of its review item", async () => {
    const reviewDir = await reviewDirWith("confirm_demerger,demerger:SIEMENS:2025-04-07,,,,");
    await buildWith(reviewDir);
    expect(await factorsOf("SIEMENS")).toEqual([`2025-04-07 ${ESTIMATE.toFixed(6)}`]);
  });

  it("applies an explicit factor instead of the estimate", async () => {
    const reviewDir = await reviewDirWith("confirm_demerger,,SIEMENS,2025-04-07,1.9,Ratio from the scheme document");
    await buildWith(reviewDir);
    expect(await factorsOf("SIEMENS")).toEqual(["2025-04-07 1.900000"]);
    expect(await adjustedClose("SIEMENS", "2025-04-04")).toBeCloseTo(4928.15 / 1.9, 6);
  });

  it("applies an explicit factor even when there is no estimate", async () => {
    const reviewDir = await reviewDirWith("confirm_demerger,,NOBARS,2025-04-07,3/2,");
    await buildWith(reviewDir);
    expect(await factorsOf("NOBARS")).toEqual(["2025-04-07 1.500000"]);
  });

  it("removes the demerger from the review queue", async () => {
    const reviewDir = await reviewDirWith("confirm_demerger,,SIEMENS,2025-04-07,,");
    await buildWith(reviewDir);
    const ids = (await reviewItems(reviewDir)).map((i) => i.id);
    expect(ids).not.toContain("demerger:SIEMENS:2025-04-07");
    expect(ids).toContain("demerger:NOBARS:2025-04-07");
  });

  it("explains the price drop, so it is not a Suspected Break or an action with no visible jump", async () => {
    const reviewDir = await reviewDirWith("confirm_demerger,,SIEMENS,2025-04-07,,");
    await buildWith(reviewDir);
    const ids = (await reviewItems(reviewDir)).map((i) => i.id);
    expect(ids).not.toContain("break:SIEMENS:2025-04-07");
    expect(ids).not.toContain("no-jump:SIEMENS:2025-04-07");
  });

  it("restores the undecided state when the decision is deleted and the build re-run", async () => {
    const reviewDir = await reviewDirWith("confirm_demerger,,SIEMENS,2025-04-07,,");
    await buildWith(reviewDir);
    expect(await factorsOf("SIEMENS")).not.toEqual([]);

    await fs.rm(path.join(reviewDir, "decisions.csv"));
    await buildWith(reviewDir);
    expect(await factorsOf("SIEMENS")).toEqual([]);
    expect(await adjustedClose("SIEMENS", "2025-04-04")).toBe(4928.15);
  });
});

describe("a confirmation that does not apply", () => {
  const cases: [string, string, RegExp][] = [
    ["names a demerger NSE does not list", "confirm_demerger,,NOSUCH,2025-04-07,,", /row 2.*NOSUCH.*2025-04-07/],
    ["names the wrong ex-date", "confirm_demerger,,SIEMENS,2025-04-08,,", /row 2.*SIEMENS.*2025-04-08/],
    ["uses the wrong kind of item ID", "confirm_demerger,break:SIEMENS:2025-04-07,,,,", /row 2.*"demerger:SYMBOL:DATE"/],
    ["accepts an estimate that does not exist", "confirm_demerger,,NOBARS,2025-04-07,,", /row 2.*NOBARS.*no estimate.*factor/],
    ["gives a nonsense factor", "confirm_demerger,,SIEMENS,2025-04-07,double,", /row 2.*factor/],
    ["gives a factor of 1", "confirm_demerger,,SIEMENS,2025-04-07,1,", /row 2.*factor of 1/],
  ];

  it.each(cases)("fails the build when it %s", async (_name, row, message) => {
    await expect(buildWith(await reviewDirWith(row))).rejects.toThrow(message);
  });

  it("fails when the same demerger is confirmed twice", async () => {
    const reviewDir = await reviewDirWith("confirm_demerger,,SIEMENS,2025-04-07,,", "confirm_demerger,demerger:SIEMENS:2025-04-07,,,2,");
    await expect(buildWith(reviewDir)).rejects.toThrow(/row 3.*already decided on row 2/);
  });

  it("fails when the demerger was also rejected", async () => {
    const reviewDir = await reviewDirWith("reject_action,,SIEMENS,2025-04-07,,", "confirm_demerger,,SIEMENS,2025-04-07,,");
    await expect(buildWith(reviewDir)).rejects.toThrow(/row 3.*SIEMENS/);
  });
});
