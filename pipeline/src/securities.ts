import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import type pg from "pg";
import { isoDate } from "./adjustments";

/** A date before every other, for "since the beginning". Postgres accepts it as a date. */
export const FOREVER_AGO = "-infinity";
/** A date after every other, for "until now". */
export const FOREVER = "infinity";

/** One row of NSE's `symbolchange.csv`: a company's symbol changes on a date. */
export interface SymbolChange {
  oldSymbol: string;
  newSymbol: string;
  /** ISO date the new symbol takes effect. */
  effective: string;
}

/** A symbol a Security held from one date until the next symbol it held. */
export interface SymbolHolding {
  securityId: string;
  symbol: string;
  /** ISO date, inclusive; {@link FOREVER_AGO} for the first symbol. */
  from: string;
  /** ISO date, exclusive; {@link FOREVER} for the current symbol. */
  to: string;
}

/** Plain ordering: ISO dates and "-infinity" compare right as text, but localeCompare ignores the "-". */
const compare = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/** The newest `.csv` by file name under `reference/<subdir>/`, or undefined when there is none. */
async function newestSnapshot(referenceDir: string, subdir: string): Promise<string | undefined> {
  const dir = path.join(referenceDir, subdir);
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
  const latest = names.filter((n) => n.endsWith(".csv")).sort().at(-1);
  return latest === undefined ? undefined : path.join(dir, latest);
}

/** A NSE CSV snapshot as records keyed by trimmed, upper-cased header: values may carry padding. */
async function readCsvRecords(file: string): Promise<Record<string, string>[]> {
  return parse(await fs.readFile(file, "utf8"), {
    columns: (header: string[]) => header.map((h) => h.trim().toUpperCase()),
    skip_empty_lines: true,
    trim: true,
    relax_column_count: true,
  });
}

const SYMBOL_CHANGE_COLUMNS = ["OLD SYMBOL", "NEW SYMBOL", "EFFECTIVE DATE"];

/**
 * The newest `reference/symbol-changes/*.csv` by file name. NSE's file is not sorted, pads
 * some values with spaces, writes dates as dd-MON-yyyy and ends in a blank-looking line, so
 * all of that is tolerated. A missing snapshot means no renames are known. Changes effective
 * before the start date are dropped: they cannot join any bar in the window, and the old
 * symbol may since have been reused by another company.
 */
export async function loadSymbolChanges(referenceDir: string, startDate: string): Promise<SymbolChange[]> {
  const file = await newestSnapshot(referenceDir, "symbol-changes");
  if (file === undefined) return [];
  const records = await readCsvRecords(file);
  const changes: SymbolChange[] = [];
  for (const [i, r] of records.entries()) {
    const where = `${file} row ${i + 2}`;
    const values = Object.values(r).filter((v) => v !== undefined && v !== "");
    if (values.length === 0) continue; // the blank-looking last line
    for (const c of SYMBOL_CHANGE_COLUMNS) if (!(c in r)) throw new Error(`${where}: missing column "${c}"`);
    const [oldSymbol, newSymbol] = [r["OLD SYMBOL"]!, r["NEW SYMBOL"]!];
    const effective = isoDate(r["EFFECTIVE DATE"]!);
    if (effective === undefined) throw new Error(`${where}: EFFECTIVE DATE must be dd-MON-yyyy, got "${r["EFFECTIVE DATE"]}"`);
    if (oldSymbol === "" || newSymbol === "") throw new Error(`${where}: OLD SYMBOL and NEW SYMBOL must both be given`);
    if (oldSymbol !== newSymbol && effective >= startDate) changes.push({ oldSymbol, newSymbol, effective });
  }
  return changes;
}

/**
 * A Security's stable ID: a hash of the first symbol it had. It is not the symbol, so it
 * stays put when the symbol changes, and it is the same on every rebuild.
 */
const securityIdOf = (firstSymbol: string) => `sec_${createHash("sha1").update(firstSymbol).digest("hex").slice(0, 10)}`;

/**
 * Orders changes by effective date. Within one date a change whose old symbol is another
 * change's new symbol (A→B and B→C the same day) goes after it, whatever order NSE lists
 * them in, so the chain is followed end to end.
 */
function inApplyOrder(changes: SymbolChange[]): SymbolChange[] {
  const byDate = new Map<string, SymbolChange[]>();
  for (const c of changes) byDate.set(c.effective, [...(byDate.get(c.effective) ?? []), c]);
  const ordered: SymbolChange[] = [];
  for (const date of [...byDate.keys()].sort(compare)) {
    const waiting = byDate.get(date)!;
    while (waiting.length > 0) {
      // A cycle (A→B and B→A the same day) has no right order, so the first listed goes.
      const i = Math.max(0, waiting.findIndex((c) => !waiting.some((o) => o !== c && o.newSymbol === c.oldSymbol)));
      ordered.push(...waiting.splice(i, 1));
    }
  }
  return ordered;
}

/**
 * Who holds each symbol, and when. Every symbol in `symbols` (those with Daily Bars) or
 * named by a change starts as its own Security, held since the beginning. Changes are then
 * applied in date order: the Security holding the old symbol on that date takes the new
 * symbol from it. A symbol another Security held before keeps that earlier history. When a
 * Security changes symbol twice on one day, only the last symbol is recorded in its history.
 *
 * The result may include Securities with no Daily Bars (a symbol only named by a change),
 * which the caller drops once bars are assigned.
 */
export function planSecurities(symbols: Iterable<string>, changes: SymbolChange[]): SymbolHolding[] {
  const holdings = new Map<string, { securityId: string; from: string; order: number }[]>();
  let taken = 0;
  const hold = (symbol: string, securityId: string, from: string) => {
    holdings.set(symbol, [...(holdings.get(symbol) ?? []), { securityId, from, order: taken++ }]);
  };
  const known = new Set(symbols);
  for (const c of changes) known.add(c.oldSymbol).add(c.newSymbol);
  for (const symbol of known) hold(symbol, securityIdOf(symbol), FOREVER_AGO);

  const holderOn = (symbol: string, date: string) => symbolHolder(holdings.get(symbol)!, date)!;
  const current = new Map<string, string>(); // each Security's latest symbol so far
  for (const c of inApplyOrder(changes)) {
    const securityId = holderOn(c.oldSymbol, c.effective);
    if (current.get(securityId) === c.newSymbol) continue; // already its symbol: a repeated listing
    hold(c.newSymbol, securityId, c.effective);
    current.set(securityId, c.newSymbol);
  }

  // Each Security's symbols in the order they were taken; one taken and replaced the same day is dropped.
  const bySecurity = new Map<string, { symbol: string; from: string; order: number }[]>();
  for (const [symbol, held] of holdings) {
    for (const h of held) bySecurity.set(h.securityId, [...(bySecurity.get(h.securityId) ?? []), { symbol, ...h }]);
  }
  const result: SymbolHolding[] = [];
  for (const [securityId, held] of bySecurity) {
    const byTime = held.sort((a, b) => compare(a.from, b.from) || a.order - b.order);
    const kept = byTime.filter((h, i) => byTime[i + 1]?.from !== h.from);
    kept.forEach((h, i) => result.push({ securityId, symbol: h.symbol, from: h.from, to: kept[i + 1]?.from ?? FOREVER }));
  }
  return result;
}

/** The Security holding a symbol on a date: the latest holder from then, else the earliest one. */
function symbolHolder<T extends { securityId: string; from: string; order?: number }>(held: T[], date: string): string | undefined {
  const sorted = [...held].sort((a, b) => compare(a.from, b.from) || (a.order ?? 0) - (b.order ?? 0));
  let found = sorted[0];
  for (const h of sorted) if (h.from <= date) found = h;
  return found?.securityId;
}

/** Which Security a symbol means on a date, from the Securities that have Daily Bars. */
export class Securities {
  private readonly bySymbol = new Map<string, { securityId: string; from: string }[]>();

  constructor(holdings: SymbolHolding[]) {
    for (const h of holdings) {
      this.bySymbol.set(h.symbol, [...(this.bySymbol.get(h.symbol) ?? []), { securityId: h.securityId, from: h.from }]);
    }
  }

  /**
   * The Security a Corporate Action, decision or review item for `symbol` on `date` is about, or
   * undefined when no Security with Daily Bars ever traded as that symbol. A symbol is taken to
   * mean the same Security before and after its change, so an action listed under the new
   * symbol with an earlier ex-date, or the old symbol with a later one, still attaches.
   */
  at(symbol: string, date: string): string | undefined {
    const held = this.bySymbol.get(symbol);
    return held && symbolHolder(held, date);
  }
}

/** The Securities built so far, as written by the last `build`. */
export async function loadSecurities(db: Pick<pg.Pool, "query">): Promise<Securities> {
  const { rows } = await db.query<{ security_id: string; symbol: string; from_date: string; to_date: string }>(
    "SELECT security_id, symbol, from_date::text, to_date::text FROM core.security_symbol",
  );
  return new Securities(rows.map((r) => ({ securityId: r.security_id, symbol: r.symbol, from: r.from_date, to: r.to_date })));
}

/**
 * Gives every symbol with Daily Bars to a Security and writes the symbol history to
 * `core.security_symbol`. Bars are not assigned here: they pick their Security up from the
 * history. Candidate Securities that end up with no bars are removed by {@link dropEmptySecurities}.
 */
export async function writeSecurities(client: pg.PoolClient, symbols: string[], changes: SymbolChange[]): Promise<void> {
  const holdings = planSecurities(symbols, changes);
  await client.query("INSERT INTO core.security (security_id) SELECT DISTINCT unnest($1::text[])", [holdings.map((h) => h.securityId)]);
  await client.query(
    `INSERT INTO core.security_symbol (security_id, symbol, from_date, to_date)
     SELECT * FROM unnest($1::text[], $2::text[], $3::date[], $4::date[])`,
    [holdings.map((h) => h.securityId), holdings.map((h) => h.symbol), holdings.map((h) => h.from), holdings.map((h) => h.to)],
  );
}

/** Removes the Securities no Daily Bar belongs to. (NOT EXISTS: NOT IN over every bar is quadratic.) */
export async function dropEmptySecurities(client: pg.PoolClient): Promise<void> {
  const unused = (table: string) =>
    `DELETE FROM ${table} t WHERE NOT EXISTS (SELECT 1 FROM core.daily_bar b WHERE b.security_id = t.security_id)`;
  await client.query(unused("core.security_symbol"));
  await client.query(unused("core.security"));
}

const EQUITY_LIST_COLUMNS = ["SYMBOL", "NAME OF COMPANY"];

/**
 * Company names by symbol from the newest `reference/equity-list/*.csv` by file name (NSE's
 * `EQUITY_L.csv`: header cells and values may carry padding). A missing snapshot means no names are known.
 */
export async function loadEquityNames(referenceDir: string): Promise<Map<string, string>> {
  const file = await newestSnapshot(referenceDir, "equity-list");
  if (file === undefined) return new Map();
  const records = await readCsvRecords(file);
  const result = new Map<string, string>();
  for (const [i, r] of records.entries()) {
    for (const c of EQUITY_LIST_COLUMNS) if (!(c in r)) throw new Error(`${file} row ${i + 2}: missing column "${c}"`);
    const [symbol, name] = [r["SYMBOL"]!, r["NAME OF COMPANY"]!];
    if (symbol !== "" && name !== "") result.set(symbol, name);
  }
  return result;
}

/**
 * Records each Security's current name: the list's name for the symbol it trades under now.
 * Names listed for other symbols (retired ones, companies with no Daily Bars) are not used.
 */
export async function writeSecurityNames(client: pg.PoolClient, namesBySymbol: Map<string, string>): Promise<void> {
  await client.query(
    `INSERT INTO core.security_name (security_id, name)
     SELECT s.security_id, n.name
     FROM core.security_symbol s
     JOIN unnest($1::text[], $2::text[]) AS n(symbol, name) ON n.symbol = s.symbol
     WHERE s.to_date = 'infinity'`,
    [[...namesBySymbol.keys()], [...namesBySymbol.values()]],
  );
}
