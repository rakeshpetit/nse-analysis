import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { START_DATE } from "../src/config";
import { daily, type DailyOptions } from "../src/daily";
import type { Db } from "../src/db";
import { createTestDb, type TestDb } from "./testDb";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

let t: TestDb;
let scratch: string;
let opts: DailyOptions;
beforeAll(async () => {
  t = await createTestDb();
  // build writes pending-interpretations.txt next to the reference files: work on a copy.
  scratch = await fs.mkdtemp(path.join(os.tmpdir(), "daily-test-"));
  const referenceDir = path.join(scratch, "reference");
  await fs.cp(path.join(fixtures, "reference"), referenceDir, { recursive: true });
  // A Review Decision that changes the Adjusted layer: NSE's HDFCBANK bonus is rejected.
  await fs.mkdir(path.join(scratch, "review"));
  await fs.writeFile(
    path.join(scratch, "review", "decisions.csv"),
    "decision,item,symbol,date,factor,note\nreject_action,,HDFCBANK,2025-08-26,,listed in error\n",
  );
  opts = {
    filesDir: path.join(fixtures, "adjust"),
    referenceDir,
    reviewDir: path.join(scratch, "review"),
    startDate: START_DATE,
  };
});
afterAll(async () => {
  await t.drop();
  await fs.rm(scratch, { recursive: true, force: true });
});

/** Every row of every table in the pipeline's schemas, as sorted text, keyed by table name. */
async function snapshot(db: Db): Promise<Record<string, string[]>> {
  const { rows: tables } = await db.query<{ schema: string; name: string }>(
    `SELECT table_schema AS schema, table_name AS name FROM information_schema.tables
     WHERE table_schema IN ('staged', 'core', 'adjusted') AND table_type = 'BASE TABLE' ORDER BY 1, 2`,
  );
  const out: Record<string, string[]> = {};
  for (const { schema, name } of tables) {
    const { rows } = await db.query<{ row: string }>(`SELECT t::text AS row FROM ${schema}.${name} t`);
    out[`${schema}.${name}`] = rows.map((r) => r.row).sort();
  }
  return out;
}

describe("daily", () => {
  it("loads every Trading Day on the first run, and reports what is waiting for a person", async () => {
    const summary = await daily(t.db, opts);

    expect(summary.newTradingDays).toBe(10);
    expect(summary).toMatchObject({ actionsApplied: 6, openReviewItems: 2 });
    expect(summary.pendingTexts).toEqual(["Bonus 7:3"]);

    // the rejected HDFCBANK bonus in review/decisions.csv was applied
    const { rows } = await t.db.query("SELECT factor FROM adjusted.daily_bar WHERE symbol = 'HDFCBANK'");
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => Number(r.factor) === 1)).toBe(true);
  });

  it("leaves the database unchanged when run twice in a row", async () => {
    const before = await snapshot(t.db);
    const second = await daily(t.db, opts);

    expect(await snapshot(t.db)).toEqual(before);
    expect(second.newTradingDays).toBe(0);
  });

  it("fetches first, so Raw Files it saves are loaded in the same run", async () => {
    const filesDir = path.join(scratch, "files");
    await fs.cp(opts.filesDir, filesDir, { recursive: true });
    const held = (await fs.readdir(filesDir)).find((f) => f.startsWith("01NOV2024"))!;
    const text = await fs.readFile(path.join(filesDir, held), "utf8");
    await fs.rm(path.join(filesDir, held));

    const fresh = await createTestDb();
    try {
      let fetched = false;
      const summary = await daily(fresh.db, {
        ...opts,
        filesDir,
        fetch: async () => {
          fetched = true;
          await fs.writeFile(path.join(filesDir, held), text);
        },
      });
      expect(fetched).toBe(true);
      expect(summary.newTradingDays).toBe(10);
    } finally {
      await fresh.drop();
    }
  });

  it("reproduces the same database from files, reference and review alone (fetch skipped)", async () => {
    const before = await snapshot(t.db);
    const fresh = await createTestDb();
    try {
      await daily(fresh.db, opts);
      expect(await snapshot(fresh.db)).toEqual(before);
    } finally {
      await fresh.drop();
    }
  });
});
