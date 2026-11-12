import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import { withTransaction, type Db } from "./db";
import { MCAP_DIR } from "./config";

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

/** Header names of the Market Cap File layout, in order, and the `staged.mcap_row` columns they load into. */
const MCAP_HEADER = [
  "Trade Date",
  "Symbol",
  "Series",
  "Security Name",
  "Category",
  "Last Trade Date",
  "Face Value(Rs.)",
  "Issue Size",
  "Close Price/Paid up value(Rs.)",
  "Market Cap(Rs.)",
];
const MCAP_COLUMNS = [
  "trade_date",
  "symbol",
  "series",
  "security_name",
  "category",
  "last_trade_date",
  "face_value",
  "issue_size",
  "close_price",
  "market_cap",
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
 * ever read, never deleted. Market Cap Files (under `mcap/`) are listed apart from bhavcopies.
 */
async function listRawFiles(dir: string, startDate: string, mcap: boolean): Promise<string[]> {
  const entries = await fs.readdir(dir, { recursive: true });
  return entries
    .map((e) => e.split(path.sep).join("/"))
    .filter((e) => {
      const date = fileNameDate(e);
      return date !== undefined && date >= startDate && e.startsWith(`${MCAP_DIR}/`) === mcap;
    })
    .sort();
}

interface CsvRecord {
  record: string[];
  info: { lines: number };
}

/** How one kind of Raw File is read and where its Staged Rows go. */
interface Layout {
  table: string;
  /** Lower-case header names the file must start with. */
  header: string[];
  columns: string[];
  /** Totals lines at the end of a Market Cap File are shorter than its other lines. */
  relaxColumns: boolean;
}

const BHAVCOPY: Layout = { table: "staged.bhavcopy_row", header: COLUMNS, columns: COLUMNS, relaxColumns: false };
const MARKET_CAP: Layout = {
  table: "staged.mcap_row",
  header: MCAP_HEADER.map((h) => h.toLowerCase()),
  columns: MCAP_COLUMNS,
  relaxColumns: true,
};

/**
 * Replaces the Staged Rows of one Raw File with its current lines, in a single
 * transaction, so re-running never duplicates or leaves a half-loaded file.
 */
async function stageFile(db: Db, filesDir: string, relPath: string, layout: Layout): Promise<number> {
  const text = await fs.readFile(path.join(filesDir, relPath), "utf8");
  const records = parse(text, {
    bom: true,
    info: true,
    skip_empty_lines: true,
    relax_column_count: layout.relaxColumns,
  }) as unknown as CsvRecord[];

  const [header, ...rows] = records;
  const names = header?.record.map((h) => h.trim().toLowerCase());
  if (names?.join(",") !== layout.header.join(",")) {
    throw new Error(`${relPath}: unexpected header ${JSON.stringify(header?.record)}`);
  }

  const columns: (string | number)[][] = [
    rows.map(() => relPath),
    rows.map((r) => r.info.lines),
    ...layout.columns.map((_, i) => rows.map((r) => r.record[i] ?? "")),
  ];
  const casts = ["text[]", "int[]", ...layout.columns.map(() => "text[]")];

  await withTransaction(db, async (client) => {
    await client.query(`DELETE FROM ${layout.table} WHERE source_file = $1`, [relPath]);
    await client.query(
      `INSERT INTO ${layout.table} (source_file, line_number, ${layout.columns.join(", ")})
       SELECT * FROM unnest(${casts.map((c, i) => `$${i + 1}::${c}`).join(", ")})`,
      columns,
    );
  });
  return rows.length;
}

export interface LoadResult {
  /** Bhavcopies and Market Cap Files staged. */
  files: number;
  rows: number;
}

export async function load(db: Db, opts: LoadOptions): Promise<LoadResult> {
  const result: LoadResult = { files: 0, rows: 0 };
  for (const [mcap, layout] of [[false, BHAVCOPY], [true, MARKET_CAP]] as const) {
    for (const relPath of await listRawFiles(opts.filesDir, opts.startDate, mcap)) {
      result.rows += await stageFile(db, opts.filesDir, relPath, layout);
      result.files += 1;
    }
  }
  return result;
}
