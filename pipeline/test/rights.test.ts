import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "../src/build";
import { START_DATE } from "../src/config";
import { load } from "../src/load";
import { review } from "../src/review";
import { createTestDb, type TestDb } from "./testDb";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/rights");
const filesDir = path.join(fixtures, "bars");
const referenceDir = path.join(fixtures, "reference");

let t: TestDb;
let result: Awaited<ReturnType<typeof build>>;
beforeAll(async () => {
  t = await createTestDb();
  await load(t.db, { filesDir, startDate: START_DATE });
  result = await build(t.db, { startDate: START_DATE, referenceDir });
});
afterAll(async () => {
  await t.drop();
});

/** The ex-date factor of a Security on 28-Oct-2024 as numerator and denominator. */
const exDateFactor = async (symbol: string) =>
  (
    await t.db.query<{ factor_num: string; factor_den: string }>(
      "SELECT factor_num, factor_den FROM adjusted.adjustment_factor WHERE symbol = $1 AND ex_date = '2024-10-28'",
      [symbol],
    )
  ).rows.map((r) => [r.factor_num, r.factor_den]);

describe("Rights issues", () => {
  it("divides the prior close by TERP", async () => {
    // Rights 13:118 at 318, prior close 400: TERP = (118 * 400 + 13 * 318) / 131 = 51334 / 131,
    // so factor = 400 * 131 / 51334 = 26200 / 25667.
    expect(await exDateFactor("RIGHTA")).toEqual([["26200", "25667"]]);
    const { rows } = await t.db.query("SELECT close FROM adjusted.daily_bar WHERE symbol = 'RIGHTA' AND trade_date = '2024-10-25'");
    expect(Number(rows[0].close)).toBeCloseTo(400 / (26200 / 25667), 6);
  });

  it("records a factor below 1 when the issue price is above the prior close", async () => {
    // Rights 1:5 at 150, prior close 100: TERP = 650 / 6, factor = 12 / 13.
    expect(await exDateFactor("RIGHTHI")).toEqual([["12", "13"]]);
    const { rows } = await t.db.query("SELECT close FROM adjusted.daily_bar WHERE symbol = 'RIGHTHI' AND trade_date = '2024-10-25'");
    expect(Number(rows[0].close)).toBeCloseTo(100 / (12 / 13), 6);
  });

  it("multiplies a rights factor with other actions on the same ex-date", async () => {
    // Bonus 1:1 (x2) and rights 1:4 at 100 on a prior close of 200: TERP 180, factor 10/9 -> 20/9.
    expect(await exDateFactor("RIGHTBON")).toEqual([["20", "9"]]);
  });

  it("expects no price jump from a rights issue at or above the prior close", async () => {
    const { rows } = await t.db.query("SELECT symbol FROM adjusted.action_without_jump ORDER BY symbol");
    // RIGHTHI: no jump expected. RIGHTHB: bonus 1:1 plus rights at 300 on a close of 200 (0.8) -> the open of 100 matches
    // the bonus's x2 even though the combined factor is 1.6. RIGHTBON and RIGHTA show their jumps.
    expect(rows.map((r) => r.symbol)).not.toContain("RIGHTHI");
    expect(rows.map((r) => r.symbol)).not.toContain("RIGHTHB");
    expect(await exDateFactor("RIGHTHB")).toEqual([["8", "5"]]);
    const items = (await review(t.db, { startDate: START_DATE, referenceDir })).map((i) => i.id);
    expect(items.filter((id) => id.startsWith("no-jump:"))).toEqual([]);
  });

  it("rejects a rights interpretation without an issue price for its shape, and does not guess", async () => {
    expect(result.rejectedInterpretations).toEqual([
      { description: "Rights 1:3", reason: 'issue_price must be a positive number, got ""' },
    ]);
    expect(await exDateFactor("RIGHTBAD")).toEqual([]);
    const { rows } = await t.db.query("SELECT close FROM adjusted.daily_bar WHERE symbol = 'RIGHTBAD' AND trade_date = '2024-10-25'");
    expect(Number(rows[0].close)).toBe(50);
  });

  it("skips and reports a rights issue with no Daily Bar before its ex-date", async () => {
    expect(result.skippedActions).toEqual([
      {
        symbol: "RIGHTNEW",
        exDate: "2024-10-28",
        description: "Rights 1:2 @ Premium Rs 40/-",
        reason: "rights issue has no Daily Bar before its ex-date to take a prior close from",
      },
    ]);
  });
});
