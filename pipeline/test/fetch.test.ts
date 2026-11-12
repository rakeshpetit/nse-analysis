import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fetchInputs, type FetchOptions, type Http, type HttpResponse } from "../src/fetch";

const HEADER = 'SYMBOL, SERIES, DATE1, PREV_CLOSE, OPEN_PRICE, HIGH_PRICE, LOW_PRICE, LAST_PRICE, CLOSE_PRICE, AVG_PRICE, TTL_TRD_QNTY, TURNOVER_LACS, NO_OF_TRADES, DELIV_QTY, DELIV_PER\r\n';

/** Bytes NSE serves for a day: CRLF, padded values, no trailing newline: nothing a tidy parser would keep. */
function bhavcopy(day: string): Buffer {
  return Buffer.from(`${HEADER}INFY, EQ, ${day}, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 1.00, 10, 0.10, 1, -, -`, "latin1");
}

const ok = (body: Buffer | string): HttpResponse => ({ status: 200, body: Buffer.from(body) });
const notFound: HttpResponse = { status: 404, body: Buffer.from("not found") };

const CORPORATE_ACTIONS = '[ {"symbol":"INFY","exDate":"01-Sep-2026","subject":"Bonus 1:1"} ]\n';
const SYMBOL_CHANGES = "NAME OF THE COMPANY,OLD SYMBOL,NEW SYMBOL,EFFECTIVE DATE\r\n X Ltd ,OLD,NEW,01-SEP-2026\r\n";
const NAME_CHANGES = "SYMBOL,OLD NAME OF THE COMPANY,NEW NAME OF THE COMPANY,EFFECTIVE DATE\n";

/** A stand-in for NSE: the bhavcopy of each listed day, nothing for any other day. */
function nse(days: Record<string, Buffer>, overrides: Record<string, HttpResponse | Error> = {}) {
  const requests: string[] = [];
  const http: Http = async (url) => {
    requests.push(url);
    for (const [fragment, response] of Object.entries(overrides)) {
      if (url.includes(fragment)) {
        if (response instanceof Error) throw response;
        return response;
      }
    }
    const day = /sec_bhavdata_full_(\d{2})(\d{2})(\d{4})\.csv$/.exec(url);
    if (day) return days[`${day[3]}-${day[2]}-${day[1]}`] ? ok(days[`${day[3]}-${day[2]}-${day[1]}`]!) : notFound;
    if (url.includes("corporates-corporateActions")) return ok(CORPORATE_ACTIONS);
    if (url.endsWith("symbolchange.csv")) return ok(SYMBOL_CHANGES);
    if (url.endsWith("namechange.csv")) return ok(NAME_CHANGES);
    return notFound;
  };
  return { http, requests };
}

let dir: string;
let filesDir: string;
let referenceDir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), "fetch-test-"));
  filesDir = path.join(dir, "files");
  referenceDir = path.join(dir, "reference");
  await fs.mkdir(path.join(filesDir, "2026", "NOV"), { recursive: true });
  await fs.writeFile(path.join(filesDir, "2026", "NOV", "06NOV2026.csv"), bhavcopy("06-Nov-2026"));
});
afterEach(() => fs.rm(dir, { recursive: true, force: true }));

function options(http: Http, extra: Partial<FetchOptions> = {}): FetchOptions {
  return { filesDir, referenceDir, startDate: "2024-09-01", today: "2026-11-12", http, delayMs: 0, ...extra };
}
const read = (...p: string[]) => fs.readFile(path.join(dir, ...p));
const exists = (...p: string[]) => fs.access(path.join(dir, ...p)).then(() => true, () => false);

describe("bhavcopies", () => {
  it("saves each missing Trading Day after the latest file, byte for byte, and skips days NSE has no file for", async () => {
    const days = { "2026-11-09": bhavcopy("09-Nov-2026"), "2026-11-10": bhavcopy("10-Nov-2026"), "2026-11-12": bhavcopy("12-Nov-2026") };
    const { http } = nse(days); // 7 and 8 Nov (Sat, Sun) and 11 Nov (a holiday) have no file

    const result = await fetchInputs(options(http));

    for (const [day, name] of [["09", "09NOV2026"], ["10", "10NOV2026"], ["12", "12NOV2026"]] as const) {
      expect(await read("files", "2026", "NOV", `${name}.csv`)).toEqual(days[`2026-11-${day}` as keyof typeof days]);
    }
    expect(await exists("files", "2026", "NOV", "11NOV2026.csv")).toBe(false);
    expect(await exists("files", "2026", "NOV", "07NOV2026.csv")).toBe(false);
    expect(result.failures).toEqual([]);
  });

  it("skips a day for which NSE serves another day's file (it is not that day's bhavcopy)", async () => {
    // NSE answers 10 and 11 Nov (market holidays) with a copy of 09 Nov's file
    const days = { "2026-11-09": bhavcopy("09-Nov-2026"), "2026-11-10": bhavcopy("09-Nov-2026"), "2026-11-11": bhavcopy("09-Nov-2026") };
    const { http } = nse(days);

    const result = await fetchInputs(options(http));

    expect(await exists("files", "2026", "NOV", "09NOV2026.csv")).toBe(true);
    expect(await exists("files", "2026", "NOV", "10NOV2026.csv")).toBe(false);
    expect(await exists("files", "2026", "NOV", "11NOV2026.csv")).toBe(false);
    expect(result.noFile).toContain("2026-11-10");
    expect(result.failures).toEqual([]);
  });

  it("reports a failing day, keeps going, and picks that day up on the next run", async () => {
    const days = { "2026-11-09": bhavcopy("09-Nov-2026"), "2026-11-10": bhavcopy("10-Nov-2026"), "2026-11-12": bhavcopy("12-Nov-2026") };
    const broken = nse(days, { "10112026": new Error("connection reset"), "12112026": { status: 503, body: Buffer.from("busy") } });

    const result = await fetchInputs(options(broken.http));

    expect(result.failures).toEqual([
      { what: "2026-11-10", reason: "connection reset" },
      { what: "2026-11-12", reason: "HTTP 503" },
    ]);
    expect(await exists("files", "2026", "NOV", "09NOV2026.csv")).toBe(true);
    expect(await exists("files", "2026", "NOV", "10NOV2026.csv")).toBe(false);
    expect(await exists("files", "2026", "NOV", "12NOV2026.csv")).toBe(false);
  });

  it("retries a day that failed even when a later day was saved, without requesting days it already has", async () => {
    const days = { "2026-11-09": bhavcopy("09-Nov-2026"), "2026-11-10": bhavcopy("10-Nov-2026"), "2026-11-12": bhavcopy("12-Nov-2026") };
    await fetchInputs(options(nse(days, { "10112026": new Error("connection reset") }).http));
    expect(await exists("files", "2026", "NOV", "10NOV2026.csv")).toBe(false);

    const retry = nse(days);
    const result = await fetchInputs(options(retry.http));

    expect(await read("files", "2026", "NOV", "10NOV2026.csv")).toEqual(days["2026-11-10"]);
    expect(result.saved).toEqual([path.join("files", "2026", "NOV", "10NOV2026.csv")]);
    expect(retry.requests.filter((u) => u.includes("sec_bhavdata_full") && /(09|12)112026/.test(u))).toEqual([]);
  });
});

describe("Reference Snapshots", () => {
  it("saves today's corporate actions, symbol changes and name changes verbatim, named by date", async () => {
    const { http, requests } = nse({});

    const result = await fetchInputs(options(http));

    expect(await read("reference", "corporate-actions", "2026-11-12.json")).toEqual(Buffer.from(CORPORATE_ACTIONS));
    expect(await read("reference", "symbol-changes", "2026-11-12.csv")).toEqual(Buffer.from(SYMBOL_CHANGES));
    expect(await read("reference", "name-changes", "2026-11-12.csv")).toEqual(Buffer.from(NAME_CHANGES));
    expect(result.failures).toEqual([]);
    // corporate actions cover the configured start date up to today
    const url = requests.find((u) => u.includes("corporates-corporateActions"))!;
    expect(new URL(url).searchParams.get("from_date")).toBe("01-09-2024");
    expect(new URL(url).searchParams.get("to_date")).toBe("12-11-2026");
  });

  it("does not replace a snapshot already saved for the day", async () => {
    await fs.mkdir(path.join(referenceDir, "symbol-changes"), { recursive: true });
    await fs.writeFile(path.join(referenceDir, "symbol-changes", "2026-11-12.csv"), "earlier today");
    const { http, requests } = nse({});

    await fetchInputs(options(http));

    expect((await read("reference", "symbol-changes", "2026-11-12.csv")).toString()).toBe("earlier today");
    expect(requests.some((u) => u.endsWith("symbolchange.csv"))).toBe(false);
  });

  it("reports a snapshot that failed or came back as something other than the expected data, and still saves the rest", async () => {
    const { http } = nse({}, { corporates: ok("<html>Access Denied</html>"), "symbolchange.csv": { status: 403, body: Buffer.from("") } });

    const result = await fetchInputs(options(http));

    expect(result.failures.map((f) => f.what).sort()).toEqual(["corporate-actions", "symbol-changes"]);
    expect(await exists("reference", "corporate-actions", "2026-11-12.json")).toBe(false);
    expect(await exists("reference", "name-changes", "2026-11-12.csv")).toBe(true);
  });
});

describe("running again", () => {
  it("downloads nothing new and overwrites nothing", async () => {
    const days = { "2026-11-09": bhavcopy("09-Nov-2026"), "2026-11-12": bhavcopy("12-Nov-2026") };
    await fetchInputs(options(nse(days).http));
    const before = await fs.readdir(dir, { recursive: true });
    const first = await read("files", "2026", "NOV", "09NOV2026.csv");

    // NSE now serves different bytes for the same days: they must not replace what is saved
    const changed = nse({ "2026-11-09": Buffer.from("changed"), "2026-11-12": Buffer.from("changed") }, {});
    const result = await fetchInputs(options(changed.http));

    expect(result.saved).toEqual([]);
    expect(await fs.readdir(dir, { recursive: true })).toEqual(before);
    expect(await read("files", "2026", "NOV", "09NOV2026.csv")).toEqual(first);
    expect(changed.requests.filter((u) => /(09|12)112026/.test(u))).toEqual([]);
  });
});

describe("politeness", () => {
  it("pauses between requests and sends them through the one injected HTTP layer", async () => {
    const waits: number[] = [];
    const { http, requests } = nse({});

    await fetchInputs(options(http, { delayMs: 250, sleep: async (ms) => void waits.push(ms) }));

    expect(waits.length).toBe(requests.length - 1);
    expect(new Set(waits)).toEqual(new Set([250]));
  });
});
