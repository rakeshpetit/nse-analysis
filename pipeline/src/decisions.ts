import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import type pg from "pg";
import { decimal, fraction, type Fraction } from "./adjustments";

/** Where a person's rulings live, relative to the review directory. Git-tracked, never written by the pipeline. */
export const DECISIONS_FILE = "decisions.csv";

const DECISION_COLUMNS = ["decision", "item", "symbol", "date", "factor", "note"];

/** What every Review Decision names: a Security and a date, and the row it came from. */
interface DecisionTarget {
  symbol: string;
  /** ISO date: the day of a jump, or the ex-date of an action. */
  date: string;
  /** Where the row is, for error messages. */
  where: string;
}

/** Drop a Suspected Break that is a genuine price move. */
export interface DismissBreak extends DecisionTarget {
  kind: "dismiss_break";
}

/** Ignore the Corporate Action(s) NSE lists for a Security going ex on a date. */
export interface RejectAction extends DecisionTarget {
  kind: "reject_action";
}

/** Apply a Corporate Action NSE's list lacks: prices before `date` are divided by `factor`. */
export interface AddAction extends DecisionTarget {
  kind: "add_action";
  factor: Fraction;
}

/**
 * Apply a demerger NSE lists with no ratio, going ex on `date`. Without `factor` the
 * estimate (previous close ÷ ex-date open) is accepted; with one, that factor is used.
 */
export interface ConfirmDemerger extends DecisionTarget {
  kind: "confirm_demerger";
  factor?: Fraction;
}

/** A Review Decision: a human ruling on a flagged case (ADR 0001). */
export type Decision = DismissBreak | RejectAction | AddAction | ConfirmDemerger;

/** File contents, or undefined if it does not exist. */
async function readIfExists(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

/** `review/decisions.csv`. A missing file means nothing has been decided. */
export async function loadDecisions(reviewDir: string | undefined): Promise<Decision[]> {
  if (reviewDir === undefined) return [];
  const file = path.join(reviewDir, DECISIONS_FILE);
  const text = await readIfExists(file);
  if (text === undefined) return [];
  const records: Record<string, string>[] = parse(text, { columns: true, skip_empty_lines: true, trim: true });
  const decided = new Map<string, string>();
  return records.map((r, i) => {
    const where = `${file} row ${i + 2}`;
    const decision = parseRow(r, where);
    const key = `${decision.kind}|${decision.symbol}|${decision.date}`;
    const earlier = decided.get(key);
    if (earlier !== undefined) throw new Error(`${where}: ${decision.symbol} on ${decision.date} is already decided on ${earlier}`);
    decided.set(key, `row ${i + 2}`);
    return decision;
  });
}

function parseRow(r: Record<string, string>, where: string): Decision {
  for (const c of DECISION_COLUMNS) if (!(c in r)) throw new Error(`${where}: missing column "${c}"`);
  switch (r.decision) {
    case "dismiss_break":
      return { kind: "dismiss_break", ...target(r, where, "break"), where };
    case "reject_action":
      return { kind: "reject_action", ...target(r, where, "no-jump"), where };
    case "add_action":
      return { kind: "add_action", ...target(r, where, "break"), factor: factorOf(r.factor!, where), where };
    case "confirm_demerger":
      return {
        kind: "confirm_demerger",
        ...target(r, where, "demerger"),
        ...(r.factor !== "" && { factor: factorOf(r.factor!, where) }),
        where,
      };
    default:
      throw new Error(
        `${where}: unknown decision "${r.decision}" (expected add_action, reject_action, dismiss_break or confirm_demerger)`,
      );
  }
}

/** The Adjustment Factor of an added action: a positive number such as "2" or "0.1", or a ratio "a/b", not 1. */
function factorOf(text: string, where: string): Fraction {
  const parts = text.split("/");
  try {
    if (parts.length > 2) throw new Error();
    const [top, bottom] = parts.map((p) => decimal(p, "factor"));
    const factor = bottom ? fraction(top!.num * bottom.den, top!.den * bottom.num) : top!;
    if (factor.num === factor.den) throw new Error("a factor of 1 changes nothing");
    return factor;
  } catch (err) {
    const why = err instanceof Error && err.message ? err.message : `factor must be a positive number or a/b, got "${text}"`;
    throw new Error(`${where}: ${why}`);
  }
}

/** An ISO date that exists on the calendar. */
function isIsoDate(text: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && new Date(`${text}T00:00:00Z`).toISOString().startsWith(text);
}

/**
 * The Security and date a row is about: either a review item ID of the kind the
 * decision rules on, or the symbol and date named directly (not both).
 */
function target(r: Record<string, string>, where: string, itemKind: "break" | "no-jump" | "demerger"): { symbol: string; date: string } {
  const [item, symbol, date] = [r.item!, r.symbol!, r.date!];
  let found: { symbol: string; date: string };
  if (item !== "") {
    if (symbol !== "" || date !== "") throw new Error(`${where}: give either item or symbol and date, not both`);
    const m = /^([a-z-]+):([^:]+):(.+)$/.exec(item);
    if (!m || m[1] !== itemKind) {
      throw new Error(`${where}: ${r.decision} needs a "${itemKind}:SYMBOL:DATE" item ID, got "${item}"`);
    }
    found = { symbol: m[2]!, date: m[3]! };
  } else {
    if (symbol === "" || date === "") throw new Error(`${where}: give an item ID, or both symbol and date`);
    found = { symbol, date };
  }
  if (!isIsoDate(found.date)) throw new Error(`${where}: date must be YYYY-MM-DD, got "${found.date}"`);
  return found;
}

/**
 * Removes the dismissed Suspected Breaks from the review leads. Prices are not
 * touched: a dismissal says the jump is a genuine price move. A dismissal with no
 * break to match is stale or mistyped, so it is an error.
 */
export async function dismissBreaks(client: pg.PoolClient, dismissals: DismissBreak[]): Promise<void> {
  for (const d of dismissals) {
    const { rowCount } = await client.query("DELETE FROM adjusted.suspected_break WHERE symbol = $1 AND trade_date = $2", [
      d.symbol,
      d.date,
    ]);
    if (rowCount === 0) throw new Error(`${d.where}: no Suspected Break for ${d.symbol} on ${d.date} to dismiss`);
  }
}

/**
 * An added action only changes anything if the Security has a bar before its
 * ex-date and one on or after it. Anything else is a typo (symbol or date), not a ruling.
 */
export async function assertAddedActionsApply(client: pg.PoolClient, additions: AddAction[]): Promise<void> {
  for (const a of additions) {
    const { rows } = await client.query(
      `SELECT count(*) FILTER (WHERE trade_date < $2::date) AS before,
              count(*) FILTER (WHERE trade_date >= $2::date) AS after
       FROM core.daily_bar WHERE symbol = $1`,
      [a.symbol, a.date],
    );
    if (Number(rows[0].before) === 0 || Number(rows[0].after) === 0) {
      throw new Error(`${a.where}: ${a.symbol} has no Daily Bars on both sides of ${a.date}, so an action going ex then has no effect`);
    }
  }
}
