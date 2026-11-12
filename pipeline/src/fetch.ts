import fs from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";
import { MCAP_DIR } from "./config";

export interface HttpResponse {
  status: number;
  body: Buffer;
}

/** One GET. Resolves with whatever NSE answered, rejects on a network failure. */
export type Http = (url: string) => Promise<HttpResponse>;

export interface FetchOptions {
  filesDir: string;
  referenceDir: string;
  /** First Trading Day in scope (ISO date): where to start when `filesDir` has nothing in scope yet. */
  startDate: string;
  /** First Trading Day whose Market Cap File is fetched: there is no backfill before it. */
  mcapStartDate: string;
  /** Today in IST (ISO date). */
  today: string;
  http: Http;
  /** Pause before each request after the first, so NSE is not hammered. */
  delayMs: number;
  /** Waits for the given milliseconds. Defaults to a real timer; tests pass a recorder. */
  sleep?: (ms: number) => Promise<void>;
}

export interface FetchResult {
  /** Paths written, relative to the directory they were written under. */
  saved: string[];
  /** Days NSE had no bhavcopy for (weekends, holidays, not yet published). */
  noFile: string[];
  /** Days NSE had no Market Cap File for. */
  noMcapFile: string[];
  /** Everything that went wrong, one entry per day or snapshot. */
  failures: { what: string; reason: string }[];
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const DAY_MS = 86_400_000;
/**
 * Days before the newest Raw File that are looked at again, so a day that failed while a later
 * one succeeded is retried. Days already on disk cost no request; only holidays are asked again.
 */
const LOOKBACK_DAYS = 10;

const addDays = (iso: string, n: number) => new Date(Date.parse(iso) + n * DAY_MS).toISOString().slice(0, 10);

function rawFilePath(iso: string): string {
  const [year, month, day] = iso.split("-") as [string, string, string];
  const mon = MONTHS[Number(month) - 1]!;
  return path.join(year, mon, `${day}${mon}${year}.csv`);
}

function bhavcopyUrl(iso: string): string {
  const [year, month, day] = iso.split("-");
  return `https://nsearchives.nseindia.com/products/content/sec_bhavdata_full_${day}${month}${year}.csv`;
}

function mcapFilePath(iso: string): string {
  return path.join(MCAP_DIR, rawFilePath(iso));
}

function mcapUrl(iso: string): string {
  const [year, month, day] = iso.split("-") as [string, string, string];
  return `https://nsearchives.nseindia.com/archives/equities/bhavcopy/pr/PR${day}${month}${year.slice(2)}.zip`;
}

/**
 * The Market Cap File inside NSE's PR zip: the one member named `mcap<ddmmyyyy>.csv` in any case.
 * Undefined when the body is not a zip (NSE serves HTML 404 pages with status 200) or has no such member.
 */
function extractMarketCapFile(body: Buffer, iso: string): { zip: boolean; file?: Buffer } {
  const [year, month, day] = iso.split("-");
  const wanted = `mcap${day}${month}${year}.csv`;
  let members: Record<string, Uint8Array>;
  try {
    members = unzipSync(body, { filter: (m) => m.name.toLowerCase() === wanted });
  } catch {
    return { zip: false };
  }
  const member = Object.values(members)[0];
  return member ? { zip: true, file: Buffer.from(member) } : { zip: true };
}

/**
 * The date of the newest `DDMONYYYY.csv` under `dir` on or after startDate, if any. Under `files/` that
 * means Raw Files only: the Market Cap Files in `files/mcap/` are not bhavcopies.
 */
async function latestRawFileDate(dir: string, startDate: string, skip?: string): Promise<string | undefined> {
  let latest: string | undefined;
  const entries = await fs.readdir(dir, { recursive: true }).catch(() => [] as string[]);
  for (const entry of entries) {
    if (skip !== undefined && entry.split(path.sep)[0] === skip) continue;
    const m = /(?:^|[\\/])(\d{2})([A-Z]{3})(\d{4})\.csv$/.exec(entry);
    const month = m ? MONTHS.indexOf(m[2]!) : -1;
    if (!m || month < 0) continue;
    const iso = `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1]}`;
    if (iso >= startDate && (latest === undefined || iso > latest)) latest = iso;
  }
  return latest;
}

const exists = (file: string) => fs.access(file).then(() => true, () => false);

const MONTH_TITLES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The Trading Day a bhavcopy is for: the DATE1 of its first row, as an ISO date. */
function bhavcopyDate(body: Buffer): string | undefined {
  const line = body.toString("latin1").split(/\r?\n/)[1] ?? "";
  const m = /^\s*(\d{2})-([A-Za-z]{3})-(\d{4})\s*$/.exec((line.split(",")[2] ?? "").replace(/"/g, ""));
  const month = m ? MONTH_TITLES.findIndex((t) => t.toUpperCase() === m[2]!.toUpperCase()) : -1;
  return m && month >= 0 ? `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1]}` : undefined;
}

/** Writes bytes to a new file; never replaces one that is already there. */
async function saveNew(file: string, bytes: Buffer): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, bytes);
  try {
    await fs.link(tmp, file); // fails if file exists, unlike rename
  } finally {
    await fs.rm(tmp, { force: true });
  }
}

interface Snapshot {
  name: string;
  dir: string;
  ext: string;
  url: (opts: FetchOptions) => string;
  /** Throws if the body is not the data NSE should have served (an HTML error page, say). */
  check: (body: Buffer) => void;
}

const isoToNse = (iso: string) => iso.split("-").reverse().join("-");

function checkCsv(header: string): (body: Buffer) => void {
  return (body) => {
    if (!body.toString("latin1").toUpperCase().startsWith(header)) throw new Error(`not the expected CSV (no "${header}" header)`);
  };
}

const SNAPSHOTS: Snapshot[] = [
  {
    name: "corporate-actions",
    dir: "corporate-actions",
    ext: "json",
    url: (o) =>
      "https://www.nseindia.com/api/corporates-corporateActions?index=equities" +
      `&from_date=${isoToNse(o.startDate)}&to_date=${isoToNse(o.today)}`,
    check: (body) => {
      if (!Array.isArray(JSON.parse(body.toString("utf8")))) throw new Error("not a JSON array");
    },
  },
  {
    name: "symbol-changes",
    dir: "symbol-changes",
    ext: "csv",
    url: () => "https://nsearchives.nseindia.com/content/equities/symbolchange.csv",
    check: checkCsv("NAME OF THE COMPANY"),
  },
  {
    name: "name-changes",
    dir: "name-changes",
    ext: "csv",
    url: () => "https://nsearchives.nseindia.com/content/equities/namechange.csv",
    check: checkCsv("SYMBOL,OLD NAME"),
  },
];

/**
 * Brings the Raw Files and Reference Snapshots up to date. Every day without a file, from
 * shortly before the newest one up to today, is requested, and what NSE serves is saved
 * untouched. Days with no file are skipped. Each of today's snapshots is saved once. One day
 * or snapshot failing does not stop the others.
 */
export async function fetchInputs(opts: FetchOptions): Promise<FetchResult> {
  const result: FetchResult = { saved: [], noFile: [], noMcapFile: [], failures: [] };
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let requested = false;
  const get = async (url: string) => {
    if (requested) await sleep(opts.delayMs);
    requested = true;
    return opts.http(url);
  };
  const fail = (what: string, err: unknown) =>
    result.failures.push({ what, reason: err instanceof Error ? err.message : String(err) });

  const latest = await latestRawFileDate(opts.filesDir, opts.startDate, MCAP_DIR);
  const first = latest === undefined ? opts.startDate : [opts.startDate, addDays(latest, 1 - LOOKBACK_DAYS)].sort().at(-1)!;
  for (let day = first; day <= opts.today; day = addDays(day, 1)) {
    const target = path.join(opts.filesDir, rawFilePath(day));
    if (await exists(target)) continue;
    try {
      const response = await get(bhavcopyUrl(day));
      if (response.status === 404) result.noFile.push(day);
      else if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      else {
        checkCsv("SYMBOL")(response.body);
        // On some non-trading days NSE serves the previous day's file instead of a 404.
        if (bhavcopyDate(response.body) !== day) result.noFile.push(day);
        else {
          await saveNew(target, response.body);
          result.saved.push(path.join("files", rawFilePath(day)));
        }
      }
    } catch (err) {
      fail(day, err);
    }
  }

  const latestMcap = await latestRawFileDate(path.join(opts.filesDir, MCAP_DIR), opts.mcapStartDate);
  const firstMcap =
    latestMcap === undefined ? opts.mcapStartDate : [opts.mcapStartDate, addDays(latestMcap, 1 - LOOKBACK_DAYS)].sort().at(-1)!;
  for (let day = firstMcap; day <= opts.today; day = addDays(day, 1)) {
    const target = path.join(opts.filesDir, mcapFilePath(day));
    if (await exists(target)) continue;
    try {
      const response = await get(mcapUrl(day));
      if (response.status === 404) result.noMcapFile.push(day);
      else if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      else {
        const { zip, file } = extractMarketCapFile(response.body, day);
        if (!zip) result.noMcapFile.push(day);
        else if (!file) throw new Error("no Market Cap File in the zip");
        else {
          await saveNew(target, file);
          result.saved.push(path.join("files", mcapFilePath(day)));
        }
      }
    } catch (err) {
      fail(`market cap ${day}`, err);
    }
  }

  for (const snapshot of SNAPSHOTS) {
    const rel = path.join(snapshot.dir, `${opts.today}.${snapshot.ext}`);
    const target = path.join(opts.referenceDir, rel);
    if (await exists(target)) continue;
    try {
      const response = await get(snapshot.url(opts));
      if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
      snapshot.check(response.body);
      await saveNew(target, response.body);
      result.saved.push(path.join("reference", rel));
    } catch (err) {
      fail(snapshot.name, err);
    }
  }
  return result;
}

/** Today's date in India (NSE's time zone) as an ISO date. */
export function todayIst(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** The lines `fetch` prints: what was saved and what went wrong. */
export function formatFetchResult(r: FetchResult): string[] {
  const lines = [`fetch: saved ${r.saved.length} file(s)`, ...r.saved.map((f) => `  ${f}`)];
  if (r.noFile.length > 0) lines.push(`  ${r.noFile.length} day(s) with no bhavcopy on NSE (weekends, holidays, not yet published)`);
  if (r.noMcapFile.length > 0) lines.push(`  ${r.noMcapFile.length} day(s) with no Market Cap File on NSE (weekends, holidays, not yet published)`);
  for (const f of r.failures) lines.push(`  FAILED ${f.what}: ${f.reason}`);
  if (r.failures.length > 0) lines.push("  Run fetch again to retry the failed ones.");
  return lines;
}
