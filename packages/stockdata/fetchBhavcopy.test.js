const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  bhavcopyUrl,
  legacyFileFor,
  latestLocalDate,
  weekdaysBetween,
  parseCsv,
  toLegacyRecord,
  serializeLegacy,
  fetchDay,
  parseArgs,
} = require("./fetchBhavcopy");

// Header and first data row of the legacy 13FEB2025.csv (AVG_PRICE and DELIV_* left blank,
// since the new bhavcopy does not carry them).
const LEGACY_HEADER =
  'SYMBOL," SERIES"," DATE1"," PREV_CLOSE"," OPEN_PRICE"," HIGH_PRICE"," LOW_PRICE"," LAST_PRICE"," CLOSE_PRICE"," AVG_PRICE"," TTL_TRD_QNTY"," TURNOVER_LACS"," NO_OF_TRADES"," DELIV_QTY"," DELIV_PER"';
const LEGACY_20MICRONS =
  '20MICRONS," EQ"," 13-Feb-2025"," 171.14"," 171.45"," 178.78"," 170.01"," 173.00"," 173.53"," "," 112430"," 196.29"," 4329"," "," "';

const NEW_HEADER =
  "TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4";
const NEW_20MICRONS =
  "2025-02-13,2025-02-13,CM,NSE,STK,16921,INE144J01027,20MICRONS,EQ,,,,,20 MICRONS LTD,171.45,178.78,170.01,173.53,173.00,171.14,,173.50,,,112430,19628837.48,4329,F1,1,,,,,";
const NEW_QUOTED_NAME =
  '2025-02-13,2025-02-13,CM,NSE,STK,25220,IN002024Y241,182D130325,TB,,,,,"GOI TBILL, 182D",99.57,99.57,99.57,99.57,99.57,99.40,,99.57,,,100,9957.00,1,F1,100,,,,,';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "bhavcopy-test-"));
}

test("builds the new-format archive URL", () => {
  assert.equal(
    bhavcopyUrl("2025-02-13"),
    "https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_20250213_F_0000.csv.zip"
  );
});

test("maps a date to the existing files/YYYY/MON/DDMONYYYY.csv layout", () => {
  assert.equal(
    legacyFileFor("2026-11-12", "/x"),
    path.join("/x", "2026", "NOV", "12NOV2026.csv")
  );
});

test("weekdaysBetween skips Saturdays and Sundays, inclusive of both ends", () => {
  // 2025-02-14 is a Friday, 2025-02-17 is a Monday
  assert.deepEqual(
    [...weekdaysBetween("2025-02-14", "2025-02-17")],
    ["2025-02-14", "2025-02-17"]
  );
});

test("latestLocalDate finds the newest existing file, or null when there are none", () => {
  const dir = tempDir();
  assert.equal(latestLocalDate(dir), null);
  for (const [y, mon, name] of [
    ["2025", "FEB", "12FEB2025.csv"],
    ["2025", "FEB", "13FEB2025.csv"],
    ["2025", "JAN", "31JAN2025.csv"],
  ]) {
    fs.mkdirSync(path.join(dir, y, mon), { recursive: true });
    fs.writeFileSync(path.join(dir, y, mon, name), "");
  }
  assert.equal(latestLocalDate(dir), "2025-02-13");
});

test("parseCsv handles quoted fields that contain commas", async () => {
  const text = `${NEW_HEADER}\n${NEW_QUOTED_NAME}\n`;
  const [row] = await parseCsv(text);
  assert.equal(row.FinInstrmNm, "GOI TBILL, 182D");
  assert.equal(row.TckrSymb, "182D130325");
});

test("toLegacyRecord + serializeLegacy reproduce the legacy line for 20MICRONS", async () => {
  const [row] = await parseCsv(`${NEW_HEADER}\n${NEW_20MICRONS}\n`);
  const text = serializeLegacy([toLegacyRecord(row, "2025-02-13")]);
  const [header, line] = text.split("\n");
  assert.equal(header, LEGACY_HEADER);
  assert.equal(line, LEGACY_20MICRONS);
  assert.ok(text.endsWith("\n"));
});

test("TURNOVER_LACS is the new TtlTrfVal (rupees) divided by 100000", async () => {
  const [row] = await parseCsv(`${NEW_HEADER}\n${NEW_20MICRONS}\n`);
  assert.equal(toLegacyRecord(row, "2025-02-13").TURNOVER_LACS, "196.29");
});

test("TURNOVER_LACS rounds exact half-lakh-hundredths up, as the legacy files do", async () => {
  // 1291500 rupees = 12.915 lakh -> legacy file says 12.92 (float toFixed would give 12.91)
  const line = NEW_20MICRONS.replace("19628837.48", "1291500.00");
  const [row] = await parseCsv(`${NEW_HEADER}\n${line}\n`);
  assert.equal(toLegacyRecord(row, "2025-02-13").TURNOVER_LACS, "12.92");
});

test("toLegacyRecord rejects a row whose TradDt is not the requested date", async () => {
  const [row] = await parseCsv(`${NEW_HEADER}\n${NEW_20MICRONS}\n`);
  assert.throws(() => toLegacyRecord(row, "2025-02-14"), /expected 2025-02-14/);
});

test("serializeLegacy refuses values that would break the unquoted first column", () => {
  assert.throws(
    () => serializeLegacy([{ ...toBlankRecord(), SYMBOL: "A,B" }]),
    /cannot be written unquoted/
  );
});

test("fetchDay skips a day whose file already exists, without going to the network", async () => {
  const dir = tempDir();
  const target = legacyFileFor("2025-02-13", dir);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, "existing");
  const result = await fetchDay("2025-02-13", { filesDir: dir, force: false });
  assert.deepEqual(result, { status: "exists" });
  assert.equal(fs.readFileSync(target, "utf8"), "existing");
});

test("parseArgs reads options and rejects bad dates", () => {
  const opts = parseArgs(["--from", "2025-02-14", "--to", "2025-03-01", "--force", "--delay", "0"]);
  assert.equal(opts.from, "2025-02-14");
  assert.equal(opts.to, "2025-03-01");
  assert.equal(opts.force, true);
  assert.equal(opts.delay, 0);
  assert.equal(parseArgs(["--max-requests", "60"]).maxRequests, 60);
  assert.equal(parseArgs([]).maxRequests, Infinity);
  assert.throws(() => parseArgs(["--from", "2025-02-30"]), /Invalid date/);
  assert.throws(() => parseArgs(["--bogus"]), /Unknown argument/);
});

function toBlankRecord() {
  return Object.fromEntries(
    ["SYMBOL", "SERIES", "DATE1", "PREV_CLOSE", "OPEN_PRICE", "HIGH_PRICE", "LOW_PRICE", "LAST_PRICE",
      "CLOSE_PRICE", "AVG_PRICE", "TTL_TRD_QNTY", "TURNOVER_LACS", "NO_OF_TRADES", "DELIV_QTY", "DELIV_PER"]
      .map((c) => [c, ""])
  );
}
