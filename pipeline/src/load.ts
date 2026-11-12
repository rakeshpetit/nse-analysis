import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { withTransaction, type Db } from "./db";

export interface LoadOptions {
  filesDir: string;
  startDate: string;
}

/** Header names of the Raw File layout, in order, as lower-case column names. */
const COLUMNS = [
  "symbol",
  "series",
  "date1",
  "prev_close",
  "open_price",
  "high_price",
  "low_price",
  "last_price",
  "close_price",
  "avg_price",
  "ttl_trd_qnty",
  "turnover_lacs",
  "no_of_trades",
  "deliv_qty",
  "deliv_per",
];

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** ISO date from a `DDMONYYYY.csv` file name, or undefined if it isn't one. */
function fileNameDate(relPath: string): string | undefined {
  const m = /(?:^|\/)(\d{2})([A-Z]{3})(\d{4})\.csv$/.exec(relPath);
  const month = m ? MONTHS.indexOf(m[2]!) : -1;
  if (!m || month < 0) return undefined;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1]}`;
}

/**
 * Relative paths (forward slashes) of every `DDMONYYYY.csv` under dir whose
 * file-name date is on or after startDate, sorted. Older files are skipped
 * before they are opened: they use other layouts (ADR 0002). Files are only
 * ever read, never deleted.
 */
async function listRawFiles(dir: string, startDate: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { recursive: true });
  return entries
    .map((e) => e.split(path.sep).join("/"))
    .filter((e) => {
      const date = fileNameDate(e);
      return date !== undefined && date >= startDate;
    })
    .sort();
}

interface CsvRecord {
  record: string[];
  info: { lines: number };
}

/**
 * Replaces the Staged Rows of one Raw File with its current lines, in a single
 * transaction, so re-running never duplicates or leaves a half-loaded file.
 */
async function stageFile(db: Db, filesDir: string, relPath: string): Promise<number> {
  const text = await fs.readFile(path.join(filesDir, relPath), "utf8");
  const records = parse(text, {
    bom: true,
    info: true,
    skip_empty_lines: true,
  }) as unknown as CsvRecord[];

  const [header, ...rows] = records;
  const names = header?.record.map((h) => h.trim().toLowerCase());
  if (names?.join(",") !== COLUMNS.join(",")) {
    throw new Error(`${relPath}: unexpected header ${JSON.stringify(header?.record)}`);
  }

  const columns: (string | number)[][] = [
    rows.map(() => relPath),
    rows.map((r) => r.info.lines),
    ...COLUMNS.map((_, i) => rows.map((r) => r.record[i] ?? "")),
  ];
  const casts = ["text[]", "int[]", ...COLUMNS.map(() => "text[]")];

  await withTransaction(db, async (client) => {
    await client.query("DELETE FROM staged.bhavcopy_row WHERE source_file = $1", [relPath]);
    await client.query(
      `INSERT INTO staged.bhavcopy_row (source_file, line_number, ${COLUMNS.join(", ")})
       SELECT * FROM unnest(${casts.map((c, i) => `$${i + 1}::${c}`).join(", ")})`,
      columns,
    );
  });
  return rows.length;
}

export interface LoadResult {
  files: number;
  rows: number;
}

export async function load(db: Db, opts: LoadOptions): Promise<LoadResult> {
  const result: LoadResult = { files: 0, rows: 0 };
  for (const relPath of await listRawFiles(opts.filesDir, opts.startDate)) {
    result.rows += await stageFile(db, opts.filesDir, relPath);
    result.files += 1;
  }
  return result;
}
