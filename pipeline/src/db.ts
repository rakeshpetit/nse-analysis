import pg from "pg";

export type Db = pg.Pool;

export function connect(url = process.env.DATABASE_URL): Db {
  if (!url) {
    throw new Error("DATABASE_URL is not set, e.g. postgres://localhost/nse_pipeline");
  }
  return new pg.Pool({ connectionString: url });
}
