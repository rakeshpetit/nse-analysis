import { randomBytes } from "node:crypto";
import pg from "pg";
import { MIGRATIONS_DIR } from "../src/config";
import type { Db } from "../src/db";
import { migrate } from "../src/migrate";

const adminUrl = process.env.TEST_ADMIN_URL ?? "postgres://localhost/postgres";

export interface TestDb {
  db: Db;
  drop(): Promise<void>;
}

/** Creates a fresh, fully migrated, throwaway database. */
export async function createTestDb(): Promise<TestDb> {
  const name = `nse_pipeline_test_${randomBytes(4).toString("hex")}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  const db = new pg.Pool({ connectionString: url.toString() });
  await migrate(db, MIGRATIONS_DIR);

  return {
    db,
    async drop() {
      await db.end();
      const c = new pg.Client({ connectionString: adminUrl });
      await c.connect();
      await c.query(`DROP DATABASE ${name}`);
      await c.end();
    },
  };
}
