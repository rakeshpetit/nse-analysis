import { randomBytes } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const adminUrl = process.env.TEST_ADMIN_URL ?? "postgres://localhost/postgres";
const migrationsDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../pipeline/migrations",
);

export interface TestDb {
  /** Superuser-ish connection for seeding; the code under test never gets this. */
  writer: pg.Pool;
  url: string;
  drop(): Promise<void>;
}

/** A fresh throwaway database migrated with the pipeline's own migrations. */
export async function createTestDb(): Promise<TestDb> {
  const name = `nse_web_test_${randomBytes(4).toString("hex")}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  const u = new URL(adminUrl);
  u.pathname = `/${name}`;
  const url = u.toString();
  const writer = new pg.Pool({ connectionString: url });

  const files = (await fs.readdir(migrationsDir)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();
  for (const file of files) {
    await writer.query(await fs.readFile(path.join(migrationsDir, file), "utf8"));
  }

  return {
    writer,
    url,
    async drop() {
      await writer.end();
      const c = new pg.Client({ connectionString: adminUrl });
      await c.connect();
      await c.query(`DROP DATABASE ${name}`);
      await c.end();
    },
  };
}

export interface SeedBar {
  /** Security ID; also used as the symbol unless `symbol` is given. */
  id: string;
  symbol?: string;
  date: string;
  /** Unadjusted close. */
  close: number;
  /** Adjusted close and previous close, if different from the unadjusted ones. */
  adjClose?: number;
  adjPrevClose?: number;
}

/** Inserts a Daily Bar into core.daily_bar and adjusted.daily_bar (and the Security, if new). */
export async function seedBar(db: pg.Pool, bar: SeedBar): Promise<void> {
  const symbol = bar.symbol ?? bar.id;
  const adjClose = bar.adjClose ?? bar.close;
  const adjPrev = bar.adjPrevClose ?? bar.close;
  await db.query("INSERT INTO core.security (security_id) VALUES ($1) ON CONFLICT DO NOTHING", [bar.id]);
  await db.query(
    `INSERT INTO core.daily_bar (security_id, symbol, trade_date, series, prev_close, open, high, low, last, close, traded_qty, turnover_lacs, trades)
     VALUES ($1, $2, $3, 'EQ', $4, $4, $4, $4, $4, $4, 1, 1, 1)`,
    [bar.id, symbol, bar.date, bar.close],
  );
  await db.query(
    `INSERT INTO adjusted.daily_bar (security_id, symbol, trade_date, series, factor, prev_close, open, high, low, last, close, traded_qty, turnover_lacs, trades)
     VALUES ($1, $2, $3, 'EQ', 1, $4, $5, $5, $5, $5, $5, 1, 1, 1)`,
    [bar.id, symbol, bar.date, adjPrev, adjClose],
  );
}

export async function seedIssueSize(
  db: pg.Pool,
  id: string,
  date: string,
  issueSize: number,
  symbol = id,
): Promise<void> {
  await db.query("INSERT INTO core.security (security_id) VALUES ($1) ON CONFLICT DO NOTHING", [id]);
  await db.query(
    `INSERT INTO core.issue_size (security_id, symbol, trade_date, series, issue_size, file_market_cap)
     VALUES ($1, $2, $3, 'EQ', $4, 0)`,
    [id, symbol, date, issueSize],
  );
}

/** Records the symbols a Security has traded under. `to` is exclusive; omit for the current one. */
export async function seedSymbolHistory(
  db: pg.Pool,
  id: string,
  history: { symbol: string; from?: string; to?: string }[],
): Promise<void> {
  await db.query("INSERT INTO core.security (security_id) VALUES ($1) ON CONFLICT DO NOTHING", [id]);
  for (const h of history) {
    await db.query(
      `INSERT INTO core.security_symbol (security_id, symbol, from_date, to_date)
       VALUES ($1, $2, COALESCE($3::date, '-infinity'), COALESCE($4::date, 'infinity'))`,
      [id, h.symbol, h.from ?? null, h.to ?? null],
    );
  }
}
