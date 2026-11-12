import fs from "node:fs/promises";
import path from "node:path";
import type { Db } from "./db";

/**
 * Applies plain numbered SQL files (`NNNN_name.sql`) in name order, each in its
 * own transaction. Files already recorded in `public.schema_migrations` are
 * skipped, so it is safe to re-run. Returns the versions applied this run.
 */
export async function migrate(db: Db, dir: string): Promise<string[]> {
  await db.query(
    "CREATE TABLE IF NOT EXISTS public.schema_migrations (version text PRIMARY KEY)",
  );
  const done = new Set(
    (await db.query<{ version: string }>("SELECT version FROM public.schema_migrations")).rows.map(
      (r) => r.version,
    ),
  );
  const files = (await fs.readdir(dir)).filter((f) => /^\d{4}_.+\.sql$/.test(f)).sort();

  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await fs.readFile(path.join(dir, file), "utf8");
    const client = await db.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO public.schema_migrations (version) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (err) {
      await client.query("ROLLBACK");
      throw new Error(`Migration ${file} failed: ${(err as Error).message}`);
    } finally {
      client.release();
    }
    applied.push(file);
  }
  return applied;
}
