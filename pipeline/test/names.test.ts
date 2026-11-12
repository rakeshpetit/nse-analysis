import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "../src/build";
import { START_DATE } from "../src/config";
import { load } from "../src/load";
import { createTestDb, type TestDb } from "./testDb";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

let t: TestDb;
beforeAll(async () => {
  t = await createTestDb();
  await load(t.db, { filesDir: path.join(fixtures, "renames/bars"), startDate: START_DATE });
});
afterAll(async () => {
  await t.drop();
});

/** Each Security's name, keyed by the symbol it trades under today. */
const namesBySymbol = async () =>
  Object.fromEntries(
    (
      await t.db.query<{ symbol: string; name: string }>(
        `SELECT s.symbol, n.name FROM core.security_name n
         JOIN core.security_symbol s ON s.security_id = n.security_id AND s.to_date = 'infinity'`,
      )
    ).rows.map((r) => [r.symbol, r.name]),
  );

describe("build: Security names", () => {
  it("records each Security's current name from the newest equity list, under its current symbol", async () => {
    await build(t.db, { startDate: START_DATE, referenceDir: path.join(fixtures, "names/reference") });

    const names = await namesBySymbol();

    expect(names["ABREL"]).toBe("Aditya Birla Real Estate Limited"); // not the older snapshot's; not the retired symbol's
    expect(names["FLIPA"]).toBe("Flip, Bee & Co Limited"); // quoted comma
    expect(names["NEWCHAIN"]).toBe("Padded Name Limited"); // padding trimmed; the name follows the Security through two renames
  });

  it("leaves a Security with no entry in the list without a name, and names nobody else", async () => {
    await build(t.db, { startDate: START_DATE, referenceDir: path.join(fixtures, "names/reference") });

    const names = await namesBySymbol();
    const { rows } = await t.db.query("SELECT count(*)::int AS n FROM core.security_name");

    expect(names["MOVECO"]).toBeUndefined();
    expect(Object.keys(names).sort()).toEqual(["ABREL", "FLIPA", "NEWCHAIN"]);
    expect(rows[0].n).toBe(3); // the never-traded NOBARS has no Security, so no name
  });

  it("records no names when there is no equity list, and the build still succeeds", async () => {
    await build(t.db, { startDate: START_DATE, referenceDir: path.join(fixtures, "renames/reference") });

    const { rows } = await t.db.query("SELECT count(*)::int AS n FROM core.security_name");

    expect(rows[0].n).toBe(0);
  });

  it("rebuilds the names rather than accumulating them", async () => {
    await build(t.db, { startDate: START_DATE, referenceDir: path.join(fixtures, "names/reference") });
    await build(t.db, { startDate: START_DATE, referenceDir: path.join(fixtures, "names/reference") });

    const { rows } = await t.db.query("SELECT count(*)::int AS n FROM core.security_name");

    expect(rows[0].n).toBe(3);
  });

  it("rejects an equity list without the columns it needs", async () => {
    await expect(
      build(t.db, { startDate: START_DATE, referenceDir: path.join(fixtures, "names-bad/reference") }),
    ).rejects.toThrow(/NAME OF COMPANY/);
  });
});
