import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";

/** A Corporate Action as listed in a Reference Snapshot. */
interface CorporateAction {
  symbol: string;
  description: string;
  /** ISO date. */
  exDate: string;
}

/** Why a Corporate Action in the window produced no Adjustment Factor. */
export interface SkippedAction {
  symbol: string;
  exDate: string;
  description: string;
  reason: string;
}

/** The combined factor of one Security's ex-date, and the product of it and every later one. */
export interface FactorRow {
  symbol: string;
  exDate: string;
  factor: Fraction;
  cumulative: Fraction;
}

/** The combined Adjustment Factor of one Security's ex-date. */
interface ExDateFactor {
  symbol: string;
  exDate: string;
  factor: Fraction;
}

export interface AdjustmentPlan {
  factors: FactorRow[];
  skipped: SkippedAction[];
}

/** An exact ratio of positive integers in lowest terms. */
export interface Fraction {
  num: bigint;
  den: bigint;
}

const ONE: Fraction = { num: 1n, den: 1n };

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));

function fraction(num: bigint, den: bigint): Fraction {
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

const multiply = (a: Fraction, b: Fraction): Fraction => fraction(a.num * b.num, a.den * b.den);

/** A positive decimal such as "10" or "2.5" as an exact fraction. */
function decimal(text: string, what: string): Fraction {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text.trim());
  const value = m ? fraction(BigInt(m[1]! + (m[2] ?? "")), 10n ** BigInt((m[2] ?? "").length)) : null;
  if (!value || value.num === 0n) throw new Error(`${what} must be a positive number, got "${text}"`);
  return value;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** ISO date from NSE's `DD-Mon-YYYY`, or undefined for anything else (e.g. "-"). */
function isoDate(text: string): string | undefined {
  const m = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(text.trim());
  const month = m ? MONTHS.indexOf(m[2]!.toUpperCase()) : -1;
  if (!m || month < 0) return undefined;
  return `${m[3]}-${String(month + 1).padStart(2, "0")}-${m[1]}`;
}

/** File contents, or undefined if it does not exist yet. */
async function readIfExists(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, "utf8");
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

interface Interpretation {
  type: string;
  ratio: string;
  old_face_value: string;
  new_face_value: string;
}

const INTERPRETATION_COLUMNS = ["description", "type", "ratio", "old_face_value", "new_face_value", "issue_price"];

/** `reference/action-interpretations.csv` keyed by exact description text. A missing file means none yet. */
async function loadInterpretations(referenceDir: string): Promise<Map<string, Interpretation>> {
  const file = path.join(referenceDir, "action-interpretations.csv");
  const text = await readIfExists(file);
  if (text === undefined) return new Map();
  const records: Record<string, string>[] = parse(text, { columns: true, skip_empty_lines: true });
  const byDescription = new Map<string, Interpretation>();
  for (const [i, r] of records.entries()) {
    const where = `${file} row ${i + 2}`;
    for (const c of INTERPRETATION_COLUMNS) {
      if (!(c in r)) throw new Error(`${where}: missing column "${c}"`);
    }
    if (byDescription.has(r.description!)) {
      throw new Error(`${where}: duplicate Action Interpretation for "${r.description}"`);
    }
    byDescription.set(r.description!, {
      type: r.type!.trim(),
      ratio: r.ratio!,
      old_face_value: r.old_face_value!,
      new_face_value: r.new_face_value!,
    });
  }
  return byDescription;
}

/** The newest `reference/corporate-actions/*.json` by file name, as Corporate Actions in the window. */
async function loadActions(referenceDir: string, startDate: string): Promise<CorporateAction[]> {
  const dir = path.join(referenceDir, "corporate-actions");
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw err;
  }
  const latest = names.filter((n) => n.endsWith(".json")).sort().at(-1);
  if (latest === undefined) return [];

  const file = path.join(dir, latest);
  const listed: unknown = JSON.parse((await readIfExists(file))!);
  if (!Array.isArray(listed)) throw new Error(`${file}: expected a JSON array of Corporate Actions`);

  // NSE sometimes lists the same action twice; it must only count once.
  const unique = new Map<string, CorporateAction>();
  for (const entry of listed as Record<string, unknown>[]) {
    const exDate = isoDate(String(entry.exDate ?? ""));
    if (exDate === undefined || exDate < startDate) continue;
    const action = { symbol: String(entry.symbol), description: String(entry.subject), exDate };
    unique.set(JSON.stringify([action.symbol, action.exDate, action.description]), action);
  }
  return [...unique.values()];
}

/** The Adjustment Factor of one Action Interpretation, or the reason there is none. */
function factorOf(i: Interpretation): Fraction | { skip: string } {
  switch (i.type) {
    case "not_price_relevant":
      return ONE;
    case "bonus": {
      const m = /^(\d+):(\d+)$/.exec(i.ratio.trim());
      if (!m || BigInt(m[2]!) === 0n) throw new Error(`bonus ratio must look like "a:b", got "${i.ratio}"`);
      return fraction(BigInt(m[1]!) + BigInt(m[2]!), BigInt(m[2]!));
    }
    case "split":
    case "consolidation": {
      // A consolidation is a split run backwards: its new face value is the larger one.
      const old = decimal(i.old_face_value, "old_face_value");
      const next = decimal(i.new_face_value, "new_face_value");
      return fraction(old.num * next.den, old.den * next.num);
    }
    default:
      return { skip: `interpretation type "${i.type}" is not supported yet` };
  }
}

/**
 * Turns the latest Reference Snapshot and the Action Interpretations into the
 * Adjustment Factors to apply. A Corporate Action whose description has no
 * interpretation (or one of an unsupported type) is skipped and reported, never
 * guessed. A "not price-relevant" one needs no factor and is not reported.
 */
export async function planAdjustments(referenceDir: string, startDate: string): Promise<AdjustmentPlan> {
  const [actions, interpretations] = await Promise.all([
    loadActions(referenceDir, startDate),
    loadInterpretations(referenceDir),
  ]);

  const skipped: SkippedAction[] = [];
  const combined = new Map<string, ExDateFactor>();
  for (const action of actions) {
    const interpretation = interpretations.get(action.description);
    const outcome = interpretation
      ? factorOf(interpretation)
      : { skip: "no Action Interpretation for this description" };
    if ("skip" in outcome) {
      skipped.push({ ...action, reason: outcome.skip });
      continue;
    }
    // Several actions on one ex-date multiply together.
    const key = `${action.symbol}|${action.exDate}`;
    const earlier = combined.get(key);
    combined.set(key, {
      symbol: action.symbol,
      exDate: action.exDate,
      factor: earlier ? multiply(earlier.factor, outcome) : outcome,
    });
  }

  const bySymbol = new Map<string, ExDateFactor[]>();
  for (const c of combined.values()) bySymbol.set(c.symbol, [...(bySymbol.get(c.symbol) ?? []), c]);

  const factors: FactorRow[] = [];
  for (const rows of bySymbol.values()) {
    rows.sort((a, b) => a.exDate.localeCompare(b.exDate));
    let cumulative = ONE;
    for (const row of rows.reverse()) {
      cumulative = multiply(cumulative, row.factor);
      factors.push({ ...row, cumulative });
    }
  }
  skipped.sort((a, b) => a.exDate.localeCompare(b.exDate) || a.symbol.localeCompare(b.symbol));
  return { factors, skipped };
}
