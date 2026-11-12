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

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const adjustFiles = path.join(fixtures, "adjust");
const adjustReference = path.join(fixtures, "reference");
const jumpsFiles = path.join(fixtures, "jumps/bars");
const jumpsReference = path.join(fixtures, "jumps/reference");

const HEADER = "decision,item,symbol,date,factor,note";

let t: TestDb;
const scratch: string[] = [];
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.drop();
  await Promise.all(scratch.map((d) => fs.rm(d, { recursive: true, force: true })));
});

/** A review directory whose decisions.csv holds the given rows (without the header). */
async function reviewDirWith(...rows: string[]): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nse-review-"));
  scratch.push(dir);
  await fs.writeFile(path.join(dir, "decisions.csv"), [HEADER, ...rows].join("\n") + "\n");
  return dir;
}

/** A copy of the adjust reference directory without the "Bonus 1:1" interpretation, so RELIANCE's drop is unexplained. */
async function referenceWithoutBonus(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nse-ref-"));
  scratch.push(dir);
  await fs.cp(adjustReference, dir, { recursive: true });
  const file = path.join(dir, "action-interpretations.csv");
  const kept = (await fs.readFile(file, "utf8")).split("\n").filter((l) => !l.startsWith("Bonus 1:1,"));
  await fs.writeFile(file, kept.join("\n"));
  return dir;
}

async function loadAndBuild(filesDir: string, referenceDir: string, reviewDir?: string) {
  await t.db.query("TRUNCATE staged.bhavcopy_row");
  await load(t.db, { filesDir, startDate: START_DATE });
  return build(t.db, { startDate: START_DATE, referenceDir, reviewDir });
}

const breaksOf = async () =>
  (await t.db.query<{ id: string }>("SELECT symbol || ' ' || trade_date::text AS id FROM adjusted.suspected_break ORDER BY 1")).rows.map(
    (r) => r.id,
  );

const adjustedCloses = async (symbol: string) =>
  (await t.db.query("SELECT close FROM adjusted.daily_bar WHERE symbol = $1 ORDER BY trade_date", [symbol])).rows.map((r) => Number(r.close));

const reviewIds = async (referenceDir: string, reviewDir?: string) =>
  (await review(t.db, { startDate: START_DATE, referenceDir, reviewDir })).map((i) => i.id);

describe("dismiss_break", () => {
  it("drops a Suspected Break from the review queue and leaves prices unchanged", async () => {
    await loadAndBuild(jumpsFiles, jumpsReference);
    const undecidedCloses = await adjustedCloses("UPCO");
    expect(await reviewIds(jumpsReference)).toContain("break:UPCO:2024-10-11");

    const reviewDir = await reviewDirWith("dismiss_break,break:UPCO:2024-10-11,,,,F&O stock with no price band");
    await loadAndBuild(jumpsFiles, jumpsReference, reviewDir);

    expect(await breaksOf()).not.toContain("UPCO 2024-10-11");
    expect(await reviewIds(jumpsReference, reviewDir)).not.toContain("break:UPCO:2024-10-11");
    // other breaks are untouched, and so are the prices
    expect(await breaksOf()).toContain("DOWNCO 2024-10-11");
    expect(await adjustedCloses("UPCO")).toEqual(undecidedCloses);
    expect(undecidedCloses).toEqual([100, 130]);
  });
});

const factorsOf = async (symbol: string) =>
  (await t.db.query("SELECT ex_date::text, factor FROM adjusted.adjustment_factor WHERE symbol = $1 ORDER BY ex_date", [symbol])).rows.map(
    (r) => `${r.ex_date} ${Number(r.factor)}`,
  );

describe("reject_action", () => {
  it("removes the action's factor from the Adjusted layer", async () => {
    await loadAndBuild(adjustFiles, adjustReference);
    expect(await factorsOf("RELIANCE")).toEqual(["2024-10-28 2"]);
    expect(await adjustedCloses("RELIANCE")).toEqual([1327.85, 1332.1]);

    const reviewDir = await reviewDirWith("reject_action,,RELIANCE,2024-10-28,,NSE listed it in error");
    await loadAndBuild(adjustFiles, adjustReference, reviewDir);

    expect(await factorsOf("RELIANCE")).toEqual([]);
    expect(await adjustedCloses("RELIANCE")).toEqual([2655.7, 1332.1]);
  });

  it("can name the action by the ID of its review item", async () => {
    const reviewDir = await reviewDirWith("reject_action,no-jump:RELIANCE:2024-10-28,,,,");
    await loadAndBuild(adjustFiles, adjustReference, reviewDir);
    expect(await factorsOf("RELIANCE")).toEqual([]);
  });

  it("leaves other actions alone", async () => {
    const reviewDir = await reviewDirWith("reject_action,,RELIANCE,2024-10-28,,");
    await loadAndBuild(adjustFiles, adjustReference, reviewDir);
    expect(await factorsOf("SUNEX")).toEqual(["2024-11-03 2"]);
  });
});

describe("add_action", () => {
  it("removes the Suspected Break it explains and adjusts the earlier bars", async () => {
    const reference = await referenceWithoutBonus();
    await loadAndBuild(adjustFiles, reference);
    expect(await breaksOf()).toContain("RELIANCE 2024-10-28");
    expect(await adjustedCloses("RELIANCE")).toEqual([2655.7, 1332.1]);

    const reviewDir = await reviewDirWith("add_action,,RELIANCE,2024-10-28,2,Bonus 1:1 missing from the NSE list");
    await loadAndBuild(adjustFiles, reference, reviewDir);

    expect(await breaksOf()).not.toContain("RELIANCE 2024-10-28");
    expect(await factorsOf("RELIANCE")).toEqual(["2024-10-28 2"]);
    expect(await adjustedCloses("RELIANCE")).toEqual([1327.85, 1332.1]);
    expect(await reviewIds(reference, reviewDir)).not.toContain("break:RELIANCE:2024-10-28");
    // Daily Bars are never edited (ADR 0001)
    const { rows } = await t.db.query("SELECT close FROM core.daily_bar WHERE symbol = 'RELIANCE' ORDER BY trade_date");
    expect(rows.map((r) => Number(r.close))).toEqual([2655.7, 1332.1]);
  });

  it("can name the break by the ID of its review item, and give the factor as a fraction", async () => {
    const reference = await referenceWithoutBonus();
    const reviewDir = await reviewDirWith("add_action,break:RELIANCE:2024-10-28,,,4/2,");
    await loadAndBuild(adjustFiles, reference, reviewDir);
    expect(await factorsOf("RELIANCE")).toEqual(["2024-10-28 2"]);
  });

  it("multiplies with an action NSE lists on the same ex-date", async () => {
    const reviewDir = await reviewDirWith("add_action,,RELIANCE,2024-10-28,1.5,");
    await loadAndBuild(adjustFiles, adjustReference, reviewDir);
    expect(await factorsOf("RELIANCE")).toEqual(["2024-10-28 3"]);
  });
});

describe("review after decisions", () => {
  it("no longer asks for an interpretation of a rejected action", async () => {
    const before = await loadAndBuild(adjustFiles, adjustReference);
    expect(before.pendingTexts).toEqual(["Bonus 7:3"]);
    expect(await reviewIds(adjustReference)).toContainEqual(expect.stringMatching(/^no-interpretation:/));

    const reviewDir = await reviewDirWith("reject_action,,UNKNOWNCO,2024-10-29,,");
    const after = await loadAndBuild(adjustFiles, adjustReference, reviewDir);
    expect(after.pendingTexts).toEqual([]);
    expect(after.skippedActions.map((a) => a.symbol)).not.toContain("UNKNOWNCO");
    expect(await reviewIds(adjustReference, reviewDir)).not.toContainEqual(expect.stringMatching(/^no-interpretation:/));
  });
});

describe("a decision that does not apply", () => {
  const cases: [string, string, RegExp][] = [
    ["dismisses a break that does not exist", "dismiss_break,break:STEADYCO:2024-10-11,,,,", /row 2.*STEADYCO.*2024-10-11/],
    ["dismisses a break for an unknown symbol", "dismiss_break,,NOSUCH,2024-10-11,,", /row 2.*NOSUCH/],
    ["rejects an action by the ID of a review item that is not there", "reject_action,no-jump:UPCO:2024-10-11,,,,", /row 2.*UPCO.*2024-10-11/],
    ["rejects an action NSE does not list", "reject_action,,UPCO,2024-10-11,,", /row 2.*UPCO.*2024-10-11/],
    ["adds an action for an unknown symbol", "add_action,,NOSUCH,2024-10-11,2,", /row 2.*NOSUCH/],
    ["adds an action outside the Security's bars", "add_action,,UPCO,2024-12-25,2,", /row 2.*UPCO/],
    ["has an unknown decision", "delete_bar,,UPCO,2024-10-11,,", /row 2.*unknown decision "delete_bar"/],
    ["names both an item and a symbol", "dismiss_break,break:UPCO:2024-10-11,UPCO,2024-10-11,,", /row 2.*not both/],
    ["names neither an item nor a symbol and date", "dismiss_break,,UPCO,,,", /row 2.*item ID, or both symbol and date/],
    ["uses the wrong kind of item ID", "dismiss_break,no-jump:UPCO:2024-10-11,,,,", /row 2.*"break:SYMBOL:DATE"/],
    ["has an impossible date", "dismiss_break,,UPCO,2024-02-31,,", /row 2.*YYYY-MM-DD/],
    ["adds an action with no factor", "add_action,,UPCO,2024-10-11,,", /row 2.*factor/],
    ["adds an action with a nonsense factor", "add_action,,UPCO,2024-10-11,double,", /row 2.*factor/],
    ["adds an action with a zero factor", "add_action,,UPCO,2024-10-11,0/5,", /row 2.*factor/],
    ["adds an action with a factor of 1", "add_action,,UPCO,2024-10-11,3/3,", /row 2.*factor of 1/],
  ];

  it.each(cases)("fails the build when it %s", async (_name, row, message) => {
    const reviewDir = await reviewDirWith(row);
    await expect(loadAndBuild(jumpsFiles, jumpsReference, reviewDir)).rejects.toThrow(message);
  });

  it("names the row that is wrong when several are fine", async () => {
    const reviewDir = await reviewDirWith("dismiss_break,break:UPCO:2024-10-11,,,,", "dismiss_break,break:NOSUCH:2024-10-11,,,,");
    await expect(loadAndBuild(jumpsFiles, jumpsReference, reviewDir)).rejects.toThrow(/row 3.*NOSUCH/);
  });

  it("fails on a decisions file without the expected columns", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nse-review-"));
    scratch.push(dir);
    await fs.writeFile(path.join(dir, "decisions.csv"), "decision,item\ndismiss_break,break:UPCO:2024-10-11\n");
    await expect(loadAndBuild(jumpsFiles, jumpsReference, dir)).rejects.toThrow(/missing column "symbol"/);
  });

  it("leaves the previous build untouched", async () => {
    await loadAndBuild(jumpsFiles, jumpsReference);
    const before = await breaksOf();
    const reviewDir = await reviewDirWith("dismiss_break,break:UPCO:2024-10-11,,,,", "dismiss_break,break:NOSUCH:2024-10-11,,,,");
    await expect(build(t.db, { startDate: START_DATE, referenceDir: jumpsReference, reviewDir })).rejects.toThrow();
    expect(await breaksOf()).toEqual(before);
  });

  it("fails when the same thing is decided twice", async () => {
    const reviewDir = await reviewDirWith("dismiss_break,break:UPCO:2024-10-11,,,,", "dismiss_break,,UPCO,2024-10-11,,again");
    await expect(loadAndBuild(jumpsFiles, jumpsReference, reviewDir)).rejects.toThrow(/row 3.*already decided on row 2/);
  });
});

describe("the database holds nothing that is not in git", () => {
  const snapshot = async () => ({
    factors: (await t.db.query("SELECT * FROM adjusted.adjustment_factor ORDER BY symbol, ex_date")).rows,
    adjusted: (await t.db.query("SELECT * FROM adjusted.daily_bar ORDER BY symbol, trade_date")).rows,
    breaks: (await t.db.query("SELECT * FROM adjusted.suspected_break ORDER BY symbol, trade_date")).rows,
    noJumps: (await t.db.query("SELECT * FROM adjusted.action_without_jump ORDER BY symbol, ex_date")).rows,
  });

  it("restores the undecided state when decisions.csv is deleted and the build re-run", async () => {
    const reference = await referenceWithoutBonus();
    await loadAndBuild(adjustFiles, reference);
    const undecided = await snapshot();

    const reviewDir = await reviewDirWith(
      "add_action,,RELIANCE,2024-10-28,2,",
      "reject_action,,SUNEX,2024-11-03,,",
      "dismiss_break,break:SUNEX:2024-11-04,,,,",
    );
    await loadAndBuild(adjustFiles, reference, reviewDir);
    expect(await snapshot()).not.toEqual(undecided);

    await fs.rm(path.join(reviewDir, "decisions.csv"));
    await loadAndBuild(adjustFiles, reference, reviewDir);
    expect(await snapshot()).toEqual(undecided);
  });
});
