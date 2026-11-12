import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "csv-parse/sync";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { build } from "../src/build";
import { START_DATE } from "../src/config";
import { load } from "../src/load";
import { createTestDb, type TestDb } from "./testDb";

const startDate = START_DATE;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const HEADER = "description,type,ratio,old_face_value,new_face_value,issue_price\n";

let t: TestDb;
const dirs: string[] = [];
beforeAll(async () => {
  t = await createTestDb();
});
afterAll(async () => {
  await t.drop();
});
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => fs.rm(d, { recursive: true, force: true })));
});

interface Listed {
  symbol: string;
  subject: string;
  exDate: string;
}

const BAR_HEADER =
  'SYMBOL," SERIES"," DATE1"," PREV_CLOSE"," OPEN_PRICE"," HIGH_PRICE"," LOW_PRICE"," LAST_PRICE"," CLOSE_PRICE"," AVG_PRICE"," TTL_TRD_QNTY"," TURNOVER_LACS"," NO_OF_TRADES"," DELIV_QTY"," DELIV_PER"\n';

/** Stages one Daily Bar for each symbol: a Corporate Action only counts for a symbol that trades. */
async function stageBars(symbols: string[]): Promise<void> {
  const filesDir = await fs.mkdtemp(path.join(os.tmpdir(), "nse-bars-"));
  dirs.push(filesDir);
  const bar = (s: string) =>
    `${s}," EQ"," 28-Oct-2024"," 100.00"," 100.00"," 101.00"," 99.00"," 100.00"," 100.00"," 100.00"," 1000"," 1.00"," 100"," -"," -"\n`;
  await fs.writeFile(path.join(filesDir, "28OCT2024.csv"), BAR_HEADER + [...new Set(symbols)].map(bar).join(""));
  await t.db.query("TRUNCATE staged.bhavcopy_row");
  await load(t.db, { filesDir, startDate });
}

/** A throwaway reference directory with one Reference Snapshot and (optionally) interpretations, and bars for its symbols. */
async function reference(actions: Listed[], interpretations?: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nse-reference-"));
  dirs.push(dir);
  await stageBars(actions.map((a) => a.symbol));
  await fs.mkdir(path.join(dir, "corporate-actions"));
  await fs.writeFile(path.join(dir, "corporate-actions", "2025-09-01.json"), JSON.stringify(actions));
  if (interpretations !== undefined) {
    await fs.writeFile(path.join(dir, "action-interpretations.csv"), HEADER + interpretations);
  }
  return dir;
}

const pendingFile = (dir: string) => path.join(dir, "pending-interpretations.txt");

describe("pending Action Interpretations", () => {
  it("lists exactly the distinct in-window descriptions that have no interpretation", async () => {
    const dir = await reference(
      [
        { symbol: "RELIANCE", subject: "Bonus 1:1", exDate: "28-Oct-2024" },
        { symbol: "BAJFINANCE", subject: "Bonus 4:1", exDate: "16-Jun-2025" },
        { symbol: "TCS", subject: "Bonus 4:1", exDate: "17-Jun-2025" }, // same text again
        { symbol: "RIGHTSCO", subject: "Rights 13:118 @ Premium Rs 308/-", exDate: "28-Oct-2024" },
        { symbol: "OLDCO", subject: "Bonus 9:2", exDate: "30-Aug-2024" }, // before the window
        { symbol: "NODATE", subject: "Bonus 2:1", exDate: "-" },
        { symbol: "DONECO", subject: "Bonus 1:1", exDate: "28-Oct-2024" },
      ],
      "Bonus 1:1,bonus,1:1,,,\n",
    );

    const result = await build(t.db, { startDate, referenceDir: dir });

    expect(result.pendingTexts).toEqual(["Bonus 4:1", "Rights 13:118 @ Premium Rs 308/-"]);
    expect((await fs.readFile(pendingFile(dir), "utf8")).split("\n").filter(Boolean)).toEqual([
      "Bonus 4:1",
      "Rights 13:118 @ Premium Rs 308/-",
    ]);
  });

  it("reports nothing and clears a stale pending file once every description is interpreted", async () => {
    const dir = await reference(
      [{ symbol: "RELIANCE", subject: "Bonus 1:1", exDate: "28-Oct-2024" }],
      "Bonus 1:1,bonus,1:1,,,\n",
    );
    await fs.writeFile(pendingFile(dir), "Bonus 4:1\n");

    const result = await build(t.db, { startDate, referenceDir: dir });

    expect(result.pendingTexts).toEqual([]);
    await expect(fs.access(pendingFile(dir))).rejects.toThrow();
  });
});

describe("Action Interpretation shape", () => {
  const SHAPE_CASES: [string, string][] = [
    ["negative bonus ratio", "Bonus -1:1,bonus,-1:1,,,"],
    ["zero bonus ratio", "Bonus 0:1,bonus,0:1,,,"],
    ["bonus without ratio", "Bonus 1:1,bonus,,,,"],
    ["split with negative face value", "Split,split,,-2,1,"],
    ["split without new face value", "Split,split,,2,,"],
    ["split that raises the face value", "Split,split,,1,2,"],
    ["consolidation that lowers the face value", "Consol,consolidation,,10,1,"],
    ["rights without issue price", "Rights 1:10,rights,1:10,,,"],
    ["rights with zero issue price", "Rights 1:10,rights,1:10,,,0"],
    ["unknown type", "Mystery,spinoff,1:1,,,"],
  ];

  it.each(SHAPE_CASES)("rejects %s into the review queue and applies nothing", async (_name, row) => {
    const description = row.split(",")[0]!;
    const dir = await reference([{ symbol: "BADCO", subject: description, exDate: "28-Oct-2024" }], row + "\n");

    const result = await build(t.db, { startDate, referenceDir: dir });

    expect(result.rejectedInterpretations.map((r) => r.description)).toEqual([description]);
    expect(result.rejectedInterpretations[0]!.reason).not.toBe("");
    const { rows } = await t.db.query("SELECT 1 FROM adjusted.adjustment_factor WHERE symbol = 'BADCO'");
    expect(rows).toEqual([]);
    expect(result.skippedActions).toEqual([]); // reported once, as rejected - not also as skipped
    expect(result.pendingTexts).toEqual([]); // it has an interpretation, just a wrong one
  });

  it("accepts a well-shaped row of every type", async () => {
    const rows = [
      "Bonus 1:1,bonus,1:1,,,",
      "Split,split,,10,2,",
      "Consol,consolidation,,1,10,",
      "NCRPS Bonus,not_price_relevant,,,,",
      "Rights 13:118 @ Premium Rs 308/-,rights,13:118,,,318",
      "Demerger,demerger,,,,",
    ];
    const dir = await reference(
      rows.map((r, i) => ({ symbol: `OKCO${i}`, subject: r.split(",")[0]!, exDate: "28-Oct-2024" })),
      rows.join("\n") + "\n",
    );

    const result = await build(t.db, { startDate, referenceDir: dir });

    expect(result.rejectedInterpretations).toEqual([]);
    const { rows: applied } = await t.db.query(
      "SELECT symbol, factor::float8 AS factor FROM adjusted.adjustment_factor ORDER BY symbol",
    );
    expect(applied).toEqual([
      { symbol: "OKCO0", factor: 2 },
      { symbol: "OKCO1", factor: 5 },
      { symbol: "OKCO2", factor: 0.1 },
      { symbol: "OKCO3", factor: 1 },
    ]);
  });
});

describe("the interpret-corporate-actions skill", () => {
  it("documents examples that build accepts and applies", async () => {
    const examples = path.join(repoRoot, ".claude/skills/interpret-corporate-actions/examples.csv");
    const csv = await fs.readFile(examples, "utf8");
    const rows = parse(csv, { columns: true }) as { description: string; type: string }[];
    expect(new Set(rows.map((r) => r.type))).toEqual(
      new Set(["bonus", "split", "consolidation", "rights", "demerger", "not_price_relevant"]),
    );
    const dir = await reference(
      rows.map((r, i) => ({ symbol: `EXCO${i}`, subject: r.description, exDate: "28-Oct-2024" })),
    );
    await fs.writeFile(path.join(dir, "action-interpretations.csv"), csv);

    const result = await build(t.db, { startDate, referenceDir: dir });

    expect(result.rejectedInterpretations).toEqual([]);
    expect(result.pendingTexts).toEqual([]);
  });
});
