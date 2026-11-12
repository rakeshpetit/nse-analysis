import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "../src/build";
import { review } from "../src/review";
import { START_DATE } from "../src/config";
import { load } from "../src/load";
import { createTestDb, type TestDb } from "./testDb";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");
const adjustFiles = path.join(fixtures, "adjust");
const adjustReference = path.join(fixtures, "reference");
const jumpsFiles = path.join(fixtures, "jumps/bars");
const jumpsReference = path.join(fixtures, "jumps/reference");

let t: TestDb;
const scratch: string[] = [];
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.drop();
  await Promise.all(scratch.map((d) => fs.rm(d, { recursive: true, force: true })));
});

/** A copy of a reference directory whose interpretations CSV has the given description removed. */
async function referenceWithout(description: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nse-ref-"));
  scratch.push(dir);
  await fs.cp(adjustReference, dir, { recursive: true });
  const file = path.join(dir, "action-interpretations.csv");
  const kept = (await fs.readFile(file, "utf8")).split("\n").filter((l) => !l.startsWith(`${description},`));
  await fs.writeFile(file, kept.join("\n"));
  return dir;
}

/** A copy of a reference directory with one more interpretation row appended. */
async function referenceWithRow(row: string): Promise<string> {
  const dir = await referenceWithout("(nothing)");
  await fs.appendFile(path.join(dir, "action-interpretations.csv"), `${row}\n`);
  return dir;
}

async function loadAndBuild(filesDir: string, referenceDir: string, jumpThreshold?: number) {
  await t.db.query("TRUNCATE staged.bhavcopy_row");
  await load(t.db, { filesDir, startDate: START_DATE });
  return build(t.db, { startDate: START_DATE, referenceDir, jumpThreshold });
}

const breaksOf = async (symbol: string) =>
  (
    await t.db.query<{ trade_date: string }>(
      "SELECT trade_date::text FROM adjusted.suspected_break WHERE symbol = $1 ORDER BY trade_date",
      [symbol],
    )
  ).rows.map((r) => r.trade_date);

describe("Suspected Breaks", () => {
  it("are absent where an applied bonus explains the price drop", async () => {
    await loadAndBuild(adjustFiles, adjustReference);
    expect(await breaksOf("RELIANCE")).toEqual([]);
  });

  it("appear on the ex-date when the explaining interpretation is removed", async () => {
    await loadAndBuild(adjustFiles, await referenceWithout("Bonus 1:1"));
    expect(await breaksOf("RELIANCE")).toEqual(["2024-10-28"]);
  });

  describe("in the jump fixtures", () => {
    beforeAll(async () => {
      await loadAndBuild(jumpsFiles, jumpsReference);
    });

    it("catch upward jumps as well as drops", async () => {
      expect(await breaksOf("UPCO")).toEqual(["2024-10-11"]);
      expect(await breaksOf("DOWNCO")).toEqual(["2024-10-11"]);
    });

    it("ignore moves within the threshold", async () => {
      expect(await breaksOf("STEADYCO")).toEqual([]);
    });

    it("stay quiet when an applied bonus explains the drop", async () => {
      expect(await breaksOf("GOODCO")).toEqual([]);
    });

    it("remain when the applied ratio is wrong", async () => {
      // price fell 5x but the Corporate Action says 1:1 (factor 2)
      expect(await breaksOf("WRONGCO")).toEqual(["2024-10-11"]);
    });

    it("record the prices of the pair and the size of the move", async () => {
      const { rows } = await t.db.query(
        "SELECT prev_trade_date::text, prev_close, open, close, close_change FROM adjusted.suspected_break WHERE symbol = 'UPCO'",
      );
      expect(rows.map((r) => ({ ...r, prev_close: Number(r.prev_close), open: Number(r.open), close: Number(r.close), close_change: Number(r.close_change) }))).toEqual([
        { prev_trade_date: "2024-10-10", prev_close: 100, open: 100, close: 130, close_change: 0.3 },
      ]);
    });

    it("never edit Daily Bars", async () => {
      const { rows } = await t.db.query("SELECT close FROM core.daily_bar WHERE symbol = 'UPCO' ORDER BY trade_date");
      expect(rows.map((r) => Number(r.close))).toEqual([100, 130]);
    });
  });

  it("use the threshold given to build", async () => {
    await loadAndBuild(jumpsFiles, jumpsReference, 0.04);
    expect(await breaksOf("STEADYCO")).toEqual(["2024-10-11"]);
    await loadAndBuild(jumpsFiles, jumpsReference, 0.5);
    expect(await breaksOf("UPCO")).toEqual([]);
  });
});

const noJumpOf = async () =>
  (
    await t.db.query<{ symbol: string; ex_date: string }>(
      "SELECT symbol, ex_date::text FROM adjusted.action_without_jump ORDER BY symbol, ex_date",
    )
  ).rows.map((r) => `${r.symbol} ${r.ex_date}`);

describe("actions with no visible jump", () => {
  it("are flagged when the price did not move by the factor on the ex-date", async () => {
    await loadAndBuild(jumpsFiles, jumpsReference);
    // NOJUMPCO: bonus 1:1 but price flat. WRONGCO: bonus 1:1 but price fell 5x.
    expect(await noJumpOf()).toEqual(["NOJUMPCO 2024-10-11", "WRONGCO 2024-10-11"]);
  });

  it("are not flagged when the unadjusted price moved by about the factor", async () => {
    await loadAndBuild(adjustFiles, adjustReference);
    // RELIANCE 2655.70 -> 1332.10 on its 1:1 bonus; others have no bar on one side of the ex-date to compare
    expect(await noJumpOf()).not.toContain("RELIANCE 2024-10-28");
    expect(await noJumpOf()).toEqual([]);
  });

  it("do not include price-irrelevant actions (factor 1)", async () => {
    await loadAndBuild(adjustFiles, adjustReference);
    expect((await noJumpOf()).join()).not.toContain("NOPRICE");
  });

  it("record the unadjusted prices around the ex-date", async () => {
    await loadAndBuild(jumpsFiles, jumpsReference);
    const { rows } = await t.db.query(
      `SELECT factor, prev_trade_date::text, prev_close, trade_date::text, open, close
       FROM adjusted.action_without_jump WHERE symbol = 'WRONGCO'`,
    );
    expect(rows.map((r) => ({ ...r, factor: Number(r.factor), prev_close: Number(r.prev_close), open: Number(r.open), close: Number(r.close) }))).toEqual([
      { factor: 2, prev_trade_date: "2024-10-10", prev_close: 500, trade_date: "2024-10-11", open: 100, close: 100 },
    ]);
  });
});

const flaggedPrevClose = async () =>
  (
    await t.db.query<{ symbol: string; trade_date: string }>(
      "SELECT symbol, trade_date::text FROM core.daily_bar_flag WHERE flag = 'prev_close_mismatch' ORDER BY symbol, trade_date",
    )
  ).rows.map((r) => `${r.symbol} ${r.trade_date}`);

describe("prev-close Quality Flag", () => {
  it("flags a bar whose prev close is not the previous Daily Bar's close", async () => {
    await loadAndBuild(jumpsFiles, jumpsReference);
    expect(await flaggedPrevClose()).toEqual(["MISPREV 2024-10-11"]);
  });

  it("lets the first bar of a Security and matching bars pass", async () => {
    await loadAndBuild(jumpsFiles, jumpsReference);
    expect(await flaggedPrevClose()).not.toContain("UPCO 2024-10-10");
    expect(await flaggedPrevClose()).not.toContain("UPCO 2024-10-11");
  });

  it("accepts a different prev close on the first bar on or after an ex-date", async () => {
    await loadAndBuild(jumpsFiles, jumpsReference);
    // ADJPREV closed 200, then went ex a 1:1 bonus with prev close 100
    expect(await flaggedPrevClose()).not.toContain("ADJPREV 2024-10-11");
  });

  it("still flags a mismatch with no action to explain it, keeping the bar", async () => {
    await loadAndBuild(adjustFiles, adjustReference);
    // GAPCO has no bar between 25 and 30 Oct and the 30 Oct bar's prev close (52.52) is not 25 Oct's close (51)
    expect(await flaggedPrevClose()).toContain("GAPCO 2024-10-30");
    const { rows } = await t.db.query("SELECT 1 FROM core.daily_bar WHERE symbol = 'GAPCO' AND trade_date = '2024-10-30'");
    expect(rows).toHaveLength(1);
  });
});

describe("review", () => {
  const itemsOf = async (referenceDir: string) => review(t.db, { startDate: START_DATE, referenceDir });

  it("lists Suspected Breaks and actions with no visible jump, each with a stable ID", async () => {
    await loadAndBuild(jumpsFiles, jumpsReference);
    const items = await itemsOf(jumpsReference);
    const ids = items.map((i) => i.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        "break:UPCO:2024-10-11",
        "break:DOWNCO:2024-10-11",
        "break:WRONGCO:2024-10-11",
        "no-jump:WRONGCO:2024-10-11",
        "no-jump:NOJUMPCO:2024-10-11",
      ]),
    );
    expect(ids).not.toContain("break:STEADYCO:2024-10-11");
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("gives the same IDs when everything is rebuilt", async () => {
    await loadAndBuild(jumpsFiles, jumpsReference);
    const before = (await itemsOf(jumpsReference)).map((i) => i.id);
    await loadAndBuild(jumpsFiles, jumpsReference);
    expect((await itemsOf(jumpsReference)).map((i) => i.id)).toEqual(before);
  });

  it("shows the prices around the date of a Suspected Break", async () => {
    await loadAndBuild(jumpsFiles, jumpsReference);
    const item = (await itemsOf(jumpsReference)).find((i) => i.id === "break:UPCO:2024-10-11")!;
    expect(item.kind).toBe("suspected_break");
    expect(item.prices!.map((p) => [p.tradeDate, Number(p.close)])).toEqual([
      ["2024-10-10", 100],
      ["2024-10-11", 130],
    ]);
  });

  it("shows the prices around the ex-date of an action with no visible jump", async () => {
    await loadAndBuild(jumpsFiles, jumpsReference);
    const item = (await itemsOf(jumpsReference)).find((i) => i.id === "no-jump:WRONGCO:2024-10-11")!;
    expect(item.kind).toBe("action_without_jump");
    expect(item.prices!.map((p) => [p.tradeDate, Number(p.close)])).toEqual([
      ["2024-10-10", 500],
      ["2024-10-11", 100],
    ]);
  });

  it("lists a description with no interpretation, with the actions that use it", async () => {
    await loadAndBuild(adjustFiles, adjustReference);
    const item = (await itemsOf(adjustReference)).find((i) => i.kind === "no_interpretation")!;
    expect(item.id).toMatch(/^no-interpretation:[0-9a-f]{10}$/);
    expect(item.description).toBe("Bonus 7:3");
    expect(item.detail.join("\n")).toContain("UNKNOWNCO");
  });

  it("lists an interpretation rejected for shape", async () => {
    const reference = await referenceWithRow("Bonus 7:3,bonus,seven to three,,,");
    await loadAndBuild(adjustFiles, reference);
    const items = await itemsOf(reference);
    const item = items.find((i) => i.kind === "rejected_interpretation")!;
    expect(item.id).toMatch(/^rejected-interpretation:[0-9a-f]{10}$/);
    expect(item.description).toBe("Bonus 7:3");
    expect(item.detail.join("\n")).toContain("ratio");
    // a rejected description is no longer "missing"
    expect(items.some((i) => i.kind === "no_interpretation")).toBe(false);
  });

  it("keys a description the same way whether it is missing or rejected for shape", async () => {
    await loadAndBuild(adjustFiles, adjustReference);
    const a = (await itemsOf(adjustReference)).find((i) => i.kind === "no_interpretation")!.id.split(":")[1];
    const reference = await referenceWithRow("Bonus 7:3,bonus,seven to three,,,");
    await loadAndBuild(adjustFiles, reference);
    const b = (await itemsOf(reference)).find((i) => i.kind === "rejected_interpretation")!.id.split(":")[1];
    expect(a).toBe(b);
  });

  it("is empty after RELIANCE's bonus is interpreted and nothing else is open for it", async () => {
    await loadAndBuild(adjustFiles, adjustReference);
    const items = await itemsOf(adjustReference);
    expect(items.filter((i) => i.id.includes("RELIANCE"))).toEqual([]);
  });
});
