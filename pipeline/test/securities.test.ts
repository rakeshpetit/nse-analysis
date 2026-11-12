import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build, type BuildResult } from "../src/build";
import { START_DATE } from "../src/config";
import { load } from "../src/load";
import { createTestDb, type TestDb } from "./testDb";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/renames");

let t: TestDb;
let result: BuildResult;
beforeAll(async () => {
  t = await createTestDb();
  await load(t.db, { filesDir: path.join(fixtures, "bars"), startDate: START_DATE });
  result = await build(t.db, { startDate: START_DATE, referenceDir: path.join(fixtures, "reference") });
});
afterAll(async () => {
  await t.drop();
});

/** The distinct Securities a set of symbols trade as. */
const securitiesOf = async (...symbols: string[]) =>
  (
    await t.db.query<{ security_id: string }>(
      "SELECT DISTINCT security_id FROM core.daily_bar WHERE symbol = ANY($1) ORDER BY 1",
      [symbols],
    )
  ).rows.map((r) => r.security_id);

describe("Securities", () => {
  it("join the old and new symbols of a rename inside the window", async () => {
    const ids = await securitiesOf("CENTURYTEX", "ABREL");
    expect(ids).toHaveLength(1);
    expect(ids[0]).not.toMatch(/CENTURYTEX|ABREL/);

    const { rows } = await t.db.query(
      "SELECT symbol, from_date::text, to_date::text FROM core.security_symbol WHERE security_id = $1 ORDER BY from_date",
      [ids[0]],
    );
    expect(rows).toEqual([
      { symbol: "CENTURYTEX", from_date: "-infinity", to_date: "2024-10-10" },
      { symbol: "ABREL", from_date: "2024-10-10", to_date: "infinity" },
    ]);
  });

  it("follow two changes effective on the same day, whichever order NSE lists them in", async () => {
    const ids = await securitiesOf("OLDCHAIN", "NEWCHAIN");
    expect(ids).toHaveLength(1);
    const { rows } = await t.db.query("SELECT symbol, from_date::text, to_date::text FROM core.security_symbol WHERE security_id = $1 ORDER BY from_date", [ids[0]]);
    expect(rows).toEqual([
      { symbol: "OLDCHAIN", from_date: "-infinity", to_date: "2024-10-11" },
      { symbol: "NEWCHAIN", from_date: "2024-10-11", to_date: "infinity" },
    ]);
  });

  it("keep one Security when a symbol is changed and later changed back", async () => {
    const ids = await securitiesOf("FLIPA", "FLIPB");
    expect(ids).toHaveLength(1);
    const { rows } = await t.db.query("SELECT symbol, from_date::text, to_date::text FROM core.security_symbol WHERE security_id = $1 ORDER BY from_date", [ids[0]]);
    expect(rows).toEqual([
      { symbol: "FLIPA", from_date: "-infinity", to_date: "2024-10-10" },
      { symbol: "FLIPB", from_date: "2024-10-10", to_date: "2024-10-14" },
      { symbol: "FLIPA", from_date: "2024-10-14", to_date: "infinity" },
    ]);
  });

  it("ignore a rename from before the window, so a symbol NSE has since reused is not joined to its old owner", async () => {
    expect(await securitiesOf("REUSED", "RENAMEDAWAY")).toHaveLength(2);
  });

  it("are distinct for symbols that are not renames of each other", async () => {
    expect(await securitiesOf("CENTURYTEX", "ACSAL")).toHaveLength(2);
  });

  it("have one bar per Trading Day across the rename", async () => {
    const { rows } = await t.db.query(
      "SELECT trade_date::text, symbol FROM core.daily_bar WHERE security_id = $1 ORDER BY trade_date",
      [(await securitiesOf("ABREL"))[0]],
    );
    expect(rows.map((r) => `${r.trade_date} ${r.symbol}`)).toEqual([
      "2024-10-08 CENTURYTEX",
      "2024-10-09 CENTURYTEX",
      "2024-10-10 ABREL",
      "2024-10-11 ABREL",
      "2024-10-14 ABREL",
      "2024-10-15 ABREL",
    ]);
  });

  it("stay one Security when the series changes between EQ and BE", async () => {
    const { rows } = await t.db.query("SELECT series, security_id FROM core.daily_bar WHERE symbol = 'MOVECO' ORDER BY trade_date");
    expect(rows.map((r) => r.series)).toEqual(["EQ", "EQ", "BE", "BE"]);
    expect(new Set(rows.map((r) => r.security_id)).size).toBe(1);
    const { rows: history } = await t.db.query("SELECT symbol FROM core.security_symbol WHERE security_id = $1", [rows[0].security_id]);
    expect(history).toEqual([{ symbol: "MOVECO" }]);
  });

  it("have ids that are the same on every build", async () => {
    const before = await securitiesOf("ABREL", "ARVINDPORT", "MOVECO");
    await build(t.db, { startDate: START_DATE, referenceDir: path.join(fixtures, "reference") });
    expect(await securitiesOf("ABREL", "ARVINDPORT", "MOVECO")).toEqual(before);
  });
});

describe("a rename in the Adjusted layer", () => {
  const closes = async (symbol: string) =>
    (
      await t.db.query<{ trade_date: string; symbol: string; close: string }>(
        `SELECT trade_date::text, symbol, close::float8::text AS close FROM adjusted.daily_bar
         WHERE security_id = (SELECT security_id FROM core.daily_bar WHERE symbol = $1 LIMIT 1) ORDER BY trade_date`,
        [symbol],
      )
    ).rows.map((r) => `${r.trade_date} ${r.symbol} ${r.close}`);

  it("gives one continuous Adjusted series across the rename", async () => {
    expect(await closes("ABREL")).toEqual([
      "2024-10-08 CENTURYTEX 100",
      "2024-10-09 CENTURYTEX 100",
      "2024-10-10 ABREL 100",
      "2024-10-11 ABREL 100",
      "2024-10-14 ABREL 100",
      "2024-10-15 ABREL 100",
    ]);
  });

  it("applies a Corporate Action listed under the old symbol with an ex-date after the rename", async () => {
    const { rows } = await t.db.query(
      "SELECT symbol, ex_date::text, factor::float8 FROM adjusted.adjustment_factor WHERE ex_date BETWEEN '2024-10-01' AND '2024-10-31'",
    );
    expect(rows).toEqual([{ symbol: "ABREL", ex_date: "2024-10-14", factor: 2 }]);
  });

  it("applies a Corporate Action listed under the new symbol with an ex-date before the rename", async () => {
    expect(await closes("ARVINDPORT")).toEqual([
      "2024-12-04 ACSAL 150",
      "2024-12-05 ACSAL 150",
      "2024-12-06 ACSAL 150",
      "2024-12-09 ARVINDPORT 150",
      "2024-12-10 ARVINDPORT 150",
    ]);
  });

  it("raises no Suspected Break, and no other review item, at a rename", async () => {
    const { rows } = await t.db.query("SELECT * FROM adjusted.suspected_break");
    expect(rows).toEqual([]);
    expect((await t.db.query("SELECT * FROM adjusted.action_without_jump")).rows).toEqual([]);
    expect((await t.db.query("SELECT * FROM core.daily_bar_flag")).rows).toEqual([]);
  });

  it("counts an action NSE lists under both symbols once", async () => {
    const { rows } = await t.db.query("SELECT factor::float8 FROM adjusted.adjustment_factor ORDER BY ex_date");
    expect(rows.map((r) => r.factor)).toEqual([2, 2]); // one per Security, not squared
  });
});

describe("Corporate Actions for symbols with no EQ/BE Daily Bars", () => {
  it("are ignored: not applied, skipped, pending or awaiting review", async () => {
    expect(result.skippedActions).toEqual([]);
    expect(result.pendingTexts).toEqual([]);
    expect((await t.db.query("SELECT * FROM adjusted.adjustment_factor WHERE symbol = 'NOBARSCO'")).rows).toEqual([]);
  });
});
