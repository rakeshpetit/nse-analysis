#!/usr/bin/env node
/**
 * Downloads NSE daily equity bhavcopies and writes them into
 * files/YYYY/MON/DDMONYYYY.csv, in the same column layout as the files that
 * were downloaded before (the layout that db.js parses).
 *
 * NSE changed the bhavcopy format in July 2024. The old archive URL no longer
 * serves zips, and the new CSV has different column names. This script
 * converts each new-format row into the legacy layout. Two legacy columns,
 * AVG_PRICE and DELIV_*, are not in the new bhavcopy, so they are left blank.
 *
 * Usage:
 *   node fetchBhavcopy.js                      # day after latest file .. today (IST)
 *   node fetchBhavcopy.js --from 2025-02-14 --to 2025-03-31
 *   node fetchBhavcopy.js --force              # overwrite files that already exist
 *   node fetchBhavcopy.js --files-dir /tmp/x   # write somewhere other than files/
 *   node fetchBhavcopy.js --delay 1500         # ms to wait between NSE requests
 *
 * Needs the `unzip` command on PATH.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFile } = require("child_process");
const { promisify } = require("util");
const { Readable } = require("stream");
const csv = require("csv-parser");

const execFileAsync = promisify(execFile);

const DEFAULT_FILES_DIR = path.resolve(__dirname, "../../files");
const DEFAULT_DELAY_MS = 1000;
const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];
const MONTH_TITLES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const LEGACY_COLUMNS = [
  "SYMBOL", "SERIES", "DATE1", "PREV_CLOSE", "OPEN_PRICE", "HIGH_PRICE",
  "LOW_PRICE", "LAST_PRICE", "CLOSE_PRICE", "AVG_PRICE", "TTL_TRD_QNTY",
  "TURNOVER_LACS", "NO_OF_TRADES", "DELIV_QTY", "DELIV_PER",
];
const USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

// ---------- dates (all ISO strings, YYYY-MM-DD, handled in UTC to avoid TZ shifts)

function parseIso(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Expected a YYYY-MM-DD date, got "${iso}"`);
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (d.toISOString().slice(0, 10) !== iso) throw new Error(`Invalid date "${iso}"`);
  return d;
}

function formatIso(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(iso, n) {
  return formatIso(new Date(parseIso(iso).getTime() + n * 86400000));
}

function* weekdaysBetween(fromIso, toIso) {
  for (let iso = fromIso; iso <= toIso; iso = addDays(iso, 1)) {
    const day = parseIso(iso).getUTCDay();
    if (day !== 0 && day !== 6) yield iso;
  }
}

function todayIst() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

// ---------- paths and URLs

function bhavcopyUrl(iso) {
  return `https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_${iso.replaceAll("-", "")}_F_0000.csv.zip`;
}

function legacyFileFor(iso, filesDir = DEFAULT_FILES_DIR) {
  const [year, month, day] = iso.split("-");
  const mon = MONTHS[+month - 1];
  return path.join(filesDir, year, mon, `${day}${mon}${year}.csv`);
}

/** Latest ISO date among files/YYYY/MON/DDMONYYYY.csv, or null if none. */
function latestLocalDate(filesDir = DEFAULT_FILES_DIR) {
  let latest = null;
  const yearDirs = fs.existsSync(filesDir)
    ? fs.readdirSync(filesDir).filter((d) => /^\d{4}$/.test(d))
    : [];
  for (const year of yearDirs) {
    for (const mon of MONTHS) {
      const dir = path.join(filesDir, year, mon);
      if (!fs.existsSync(dir)) continue;
      for (const file of fs.readdirSync(dir)) {
        const m = /^(\d{2})([A-Z]{3})(\d{4})\.csv$/.exec(file);
        if (!m || m[2] !== mon || m[3] !== year) continue;
        const iso = `${year}-${String(MONTHS.indexOf(mon) + 1).padStart(2, "0")}-${m[1]}`;
        if (!latest || iso > latest) latest = iso;
      }
    }
  }
  return latest;
}

// ---------- download and extract

/** Returns the zip bytes, or null when NSE has no file for that day (holiday or not yet published). */
async function fetchZip(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Referer: "https://www.nseindia.com/",
      Accept: "*/*",
    },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.subarray(0, 2).toString("latin1") !== "PK") {
    throw new Error(`Response from ${url} is not a zip`);
  }
  return buf;
}

/** Returns the text of the single CSV inside the zip. */
async function extractCsv(zipBuf) {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "bhavcopy-"));
  try {
    const zipPath = path.join(dir, "bhavcopy.zip");
    await fs.promises.writeFile(zipPath, zipBuf);
    const { stdout: listing } = await execFileAsync("unzip", ["-Z1", zipPath]);
    const entries = listing.split("\n").filter(Boolean);
    if (entries.length !== 1) throw new Error(`Expected 1 file in zip, found ${entries.length}`);
    const { stdout } = await execFileAsync("unzip", ["-p", zipPath], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    return stdout;
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

// ---------- parse and convert

function parseCsv(text) {
  return new Promise((resolve, reject) => {
    const rows = [];
    Readable.from([text])
      .pipe(
        csv({
          mapHeaders: ({ header }) => header.trim(),
          mapValues: ({ value }) => value.trim(),
        })
      )
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows))
      .on("error", reject);
  });
}

function legacyDate(iso) {
  const [year, month, day] = iso.split("-");
  return `${day}-${MONTH_TITLES[+month - 1]}-${year}`;
}

/**
 * TtlTrfVal is rupees; the legacy TURNOVER_LACS column is lakhs to 2 decimals.
 * Done in integer units and rounded half-up, because float toFixed rounds
 * exact .xx5 values down (1291500 rupees must give 12.92, not 12.91).
 */
function turnoverLacs(ttlTrfVal) {
  if (ttlTrfVal === "") return "";
  const paise = Math.round(Number(ttlTrfVal) * 100);
  const hundredths = Math.floor((paise + 50000) / 100000); // 1 lakh = 100000 rupees = 10000000 paise
  return `${Math.floor(hundredths / 100)}.${String(hundredths % 100).padStart(2, "0")}`;
}

/** Maps one new-format bhavcopy row to the legacy column names. */
function toLegacyRecord(row, iso) {
  if (row.TradDt !== iso) {
    throw new Error(`Row for ${row.TckrSymb} has TradDt ${row.TradDt}, expected ${iso}`);
  }
  return {
    SYMBOL: row.TckrSymb,
    SERIES: row.SctySrs,
    DATE1: legacyDate(iso),
    PREV_CLOSE: row.PrvsClsgPric,
    OPEN_PRICE: row.OpnPric,
    HIGH_PRICE: row.HghPric,
    LOW_PRICE: row.LwPric,
    LAST_PRICE: row.LastPric,
    CLOSE_PRICE: row.ClsPric,
    AVG_PRICE: "",
    TTL_TRD_QNTY: row.TtlTradgVol,
    TURNOVER_LACS: turnoverLacs(row.TtlTrfVal),
    NO_OF_TRADES: row.TtlNbOfTxsExctd,
    DELIV_QTY: "",
    DELIV_PER: "",
  };
}

/** Writes records in the legacy quoting style: first column bare, the rest as `" value"`. */
function serializeLegacy(records) {
  const cell = (value, index) => {
    const text = String(value);
    if (/["\n\r]/.test(text) || (index === 0 && text.includes(","))) {
      throw new Error(`Value cannot be written unquoted in legacy format: ${JSON.stringify(text)}`);
    }
    return index === 0 ? text : `" ${text}"`;
  };
  const line = (values) => values.map(cell).join(",");
  const lines = [line(LEGACY_COLUMNS)];
  for (const record of records) {
    lines.push(line(LEGACY_COLUMNS.map((c) => record[c])));
  }
  return lines.join("\n") + "\n";
}

// ---------- per-day work

/**
 * Fetches one trading day and writes it to the legacy path.
 * Returns "written", "exists" (skipped) or "no-file" (NSE has nothing for that day).
 */
async function fetchDay(iso, { filesDir, force }) {
  const target = legacyFileFor(iso, filesDir);
  if (fs.existsSync(target) && !force) return { status: "exists" };

  const zip = await fetchZip(bhavcopyUrl(iso));
  if (!zip) return { status: "no-file" };

  const rows = await parseCsv(await extractCsv(zip));
  if (rows.length === 0) throw new Error(`No rows in bhavcopy for ${iso}`);
  const records = rows.map((row) => toLegacyRecord(row, iso));

  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp`;
  await fs.promises.writeFile(tmp, serializeLegacy(records));
  await fs.promises.rename(tmp, target);
  return { status: "written", rows: records.length };
}

// ---------- command line

function parseArgs(argv) {
  const opts = {
    from: null,
    to: null,
    force: false,
    delay: DEFAULT_DELAY_MS,
    filesDir: DEFAULT_FILES_DIR,
    maxRequests: Infinity,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg} needs a value`);
      return argv[++i];
    };
    if (arg === "--from") opts.from = next();
    else if (arg === "--to") opts.to = next();
    else if (arg === "--force") opts.force = true;
    else if (arg === "--delay") opts.delay = Number(next());
    else if (arg === "--files-dir") opts.filesDir = path.resolve(next());
    else if (arg === "--max-requests") opts.maxRequests = Number(next());
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (opts.from) parseIso(opts.from);
  if (opts.to) parseIso(opts.to);
  return opts;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main(argv) {
  const opts = parseArgs(argv);

  let from = opts.from;
  if (!from) {
    const latest = latestLocalDate(opts.filesDir);
    if (!latest) throw new Error("No existing files to continue from. Pass --from YYYY-MM-DD.");
    from = addDays(latest, 1);
  }
  const to = opts.to || todayIst();
  if (from > to) {
    console.log(`Nothing to fetch: ${from} is after ${to}.`);
    return;
  }

  console.log(`Fetching weekdays ${from} .. ${to} into ${opts.filesDir}`);
  const counts = { written: 0, exists: 0, "no-file": 0 };
  const failures = [];
  let madeRequest = false;
  let requests = 0;
  let stoppedAt = null;

  for (const iso of weekdaysBetween(from, to)) {
    if (requests >= opts.maxRequests) {
      stoppedAt = iso;
      break;
    }
    if (madeRequest && opts.delay > 0) await sleep(opts.delay);
    try {
      const result = await fetchDay(iso, opts);
      counts[result.status] += 1;
      madeRequest = result.status !== "exists";
      if (madeRequest) requests += 1;
      if (result.status === "written") console.log(`${iso} written (${result.rows} rows)`);
      else if (result.status === "no-file") console.log(`${iso} no file on NSE (holiday or not yet published)`);
    } catch (err) {
      madeRequest = true;
      requests += 1;
      failures.push(iso);
      console.error(`${iso} FAILED: ${err.message}`);
    }
  }

  console.log(
    `Done. written=${counts.written} skipped-existing=${counts.exists} no-file=${counts["no-file"]} failed=${failures.length}`
  );
  if (stoppedAt) {
    console.log(`Stopped after ${requests} requests (--max-requests ${opts.maxRequests}). Next date: ${stoppedAt}. Re-run to continue.`);
  }
  if (failures.length) {
    console.log(`Failed dates (re-run to retry): ${failures.join(", ")}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  });
}

module.exports = {
  bhavcopyUrl,
  legacyFileFor,
  latestLocalDate,
  weekdaysBetween,
  parseCsv,
  toLegacyRecord,
  serializeLegacy,
  fetchDay,
  parseArgs,
};
