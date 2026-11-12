import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import type pg from "pg";
import type { Decision } from "./decisions";

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
  /** The part of `factor` a price jump is expected for: `factor` without any rights issue at or above its prior close. */
  jump: Fraction;
  cumulative: Fraction;
}

/** The combined Adjustment Factor of one Security's ex-date. */
interface ExDateFactor {
  symbol: string;
  exDate: string;
  factor: Fraction;
  jump: Fraction;
}

/** An Adjustment Factor, and the part of it that shows as a price jump. */
interface Resolved {
  factor: Fraction;
  jump: Fraction;
}

/**
 * The close of a Security's last Daily Bar before an ex-date, as numeric text,
 * or undefined when it has none. A rights issue's factor depends on it.
 */
export type PriorClose = (symbol: string, exDate: string) => Promise<string | undefined>;

/** A PriorClose reading the unadjusted Daily Bars in Postgres. */
export const priorCloseFrom =
  (db: Pick<pg.Pool, "query">): PriorClose =>
  async (symbol, exDate) => {
    const { rows } = await db.query<{ close: string }>(
      `SELECT close::text FROM core.daily_bar
       WHERE symbol = $1 AND trade_date < $2::date ORDER BY trade_date DESC LIMIT 1`,
      [symbol, exDate],
    );
    return rows[0]?.close;
  };

export interface AdjustmentPlan {
  factors: FactorRow[];
  skipped: SkippedAction[];
  /** Distinct in-window descriptions with no Action Interpretation yet, sorted. */
  pendingTexts: string[];
  /** Action Interpretations whose shape is wrong. They are never applied; they await review. */
  rejected: RejectedInterpretation[];
}

/** An Action Interpretation with the wrong shape for its type, and what is wrong with it. */
export interface RejectedInterpretation {
  description: string;
  reason: string;
}

/** Where `build` lists the descriptions waiting for the `interpret-corporate-actions` skill. */
export const PENDING_FILE = "pending-interpretations.txt";

/** Writes the pending file (one description per line), or removes a stale one when nothing is pending. */
export async function writePendingFile(referenceDir: string, texts: string[]): Promise<void> {
  const file = path.join(referenceDir, PENDING_FILE);
  if (texts.length === 0) await fs.rm(file, { force: true });
  else await fs.writeFile(file, texts.join("\n") + "\n");
}

/** An exact ratio of positive integers in lowest terms. */
export interface Fraction {
  num: bigint;
  den: bigint;
}

const ONE: Fraction = { num: 1n, den: 1n };

const gcd = (a: bigint, b: bigint): bigint => (b === 0n ? a : gcd(b, a % b));

export function fraction(num: bigint, den: bigint): Fraction {
  const g = gcd(num, den);
  return { num: num / g, den: den / g };
}

const multiply = (a: Fraction, b: Fraction): Fraction => fraction(a.num * b.num, a.den * b.den);

/** An Action Interpretation field that does not fit its type. */
class ShapeError extends Error {}

/** A positive decimal such as "10" or "2.5" as an exact fraction. */
export function decimal(text: string, what: string): Fraction {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text.trim());
  const value = m ? fraction(BigInt(m[1]! + (m[2] ?? "")), 10n ** BigInt((m[2] ?? "").length)) : null;
  if (!value || value.num === 0n) throw new ShapeError(`${what} must be a positive number, got "${text}"`);
  return value;
}

/** A ratio "a:b" of positive whole numbers. */
function ratio(text: string): { a: bigint; b: bigint } {
  const m = /^(\d+):(\d+)$/.exec(text.trim());
  if (!m || BigInt(m[1]!) === 0n || BigInt(m[2]!) === 0n) {
    throw new ShapeError(`ratio must be two positive whole numbers like "a:b", got "${text}"`);
  }
  return { a: BigInt(m[1]!), b: BigInt(m[2]!) };
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
  issue_price: string;
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
      issue_price: r.issue_price!,
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

/** A rights issue of `a` new shares for every `b` held at `issuePrice`; its factor needs the prior close. */
interface Rights {
  rights: { a: bigint; b: bigint; issuePrice: Fraction };
}

/** What an Action Interpretation gives: a factor, a reason there is none yet, or a rights issue still to price. */
type Outcome = Fraction | { skip: string } | Rights;

/**
 * Rights issue factor: prior close ÷ TERP, where
 * TERP = (b · prior close + a · issue price) ÷ (a + b). Exact, like every factor.
 */
function rightsFactor({ a, b, issuePrice }: Rights["rights"], priorClose: Fraction): Fraction {
  return fraction(
    priorClose.num * issuePrice.den * (a + b),
    b * priorClose.num * issuePrice.den + a * issuePrice.num * priorClose.den,
  );
}

/**
 * The Adjustment Factor of one Action Interpretation, or the reason there is
 * none yet. Throws ShapeError when the fields do not fit the type.
 */
function factorOf(i: Interpretation): Outcome {
  switch (i.type) {
    case "not_price_relevant":
      return ONE;
    case "bonus": {
      const { a, b } = ratio(i.ratio);
      return fraction(a + b, b);
    }
    case "split":
    case "consolidation": {
      // A consolidation is a split run backwards: its new face value is the larger one.
      const old = decimal(i.old_face_value, "old_face_value");
      const next = decimal(i.new_face_value, "new_face_value");
      const factor = fraction(old.num * next.den, old.den * next.num);
      if (i.type === "split" && factor.num <= factor.den) {
        throw new ShapeError("a split must lower the face value (old_face_value above new_face_value)");
      }
      if (i.type === "consolidation" && factor.num >= factor.den) {
        throw new ShapeError("a consolidation must raise the face value (new_face_value above old_face_value)");
      }
      return factor;
    }
    case "rights": {
      const { a, b } = ratio(i.ratio);
      return { rights: { a, b, issuePrice: decimal(i.issue_price, "issue_price") } };
    }
    case "demerger":
      return { skip: 'interpretation type "demerger" is not supported yet' };
    default:
      throw new ShapeError(`unknown type "${i.type}"`);
  }
}

/**
 * The Corporate Actions left once the ones a person rejected are ignored. A
 * rejection that matches nothing is an error (the snapshot may have changed under it).
 */
function withoutRejected(actions: CorporateAction[], decisions: Decision[]): CorporateAction[] {
  let kept = actions;
  for (const d of decisions) {
    if (d.kind !== "reject_action") continue;
    const matches = (a: CorporateAction) => a.symbol === d.symbol && a.exDate === d.date;
    if (!actions.some(matches)) {
      throw new Error(`${d.where}: no Corporate Action for ${d.symbol} going ex on ${d.date} to reject`);
    }
    kept = kept.filter((a) => !matches(a));
  }
  return kept;
}

/** An outcome as a factor, pricing a rights issue from its prior close. */
async function resolve(
  action: CorporateAction,
  outcome: Outcome,
  priorClose: PriorClose,
): Promise<Resolved | { skip: string }> {
  if ("skip" in outcome) return outcome;
  if (!("rights" in outcome)) return { factor: outcome, jump: outcome };

  const close = await priorClose(action.symbol, action.exDate);
  if (close === undefined) return { skip: "rights issue has no Daily Bar before its ex-date to take a prior close from" };
  let price: Fraction;
  try {
    price = decimal(close, "prior close");
  } catch (err) {
    if (err instanceof ShapeError) return { skip: err.message };
    throw err;
  }
  const factor = rightsFactor(outcome.rights, price);
  // An issue price at or above the prior close gives a factor of 1 or less: recorded, but no jump is expected.
  return { factor, jump: factor.num <= factor.den ? ONE : factor };
}

/** Several actions on one ex-date multiply together. */
function addFactor(combined: Map<string, ExDateFactor>, symbol: string, exDate: string, add: Resolved): void {
  const key = `${symbol}|${exDate}`;
  const earlier = combined.get(key);
  combined.set(key, {
    symbol,
    exDate,
    factor: earlier ? multiply(earlier.factor, add.factor) : add.factor,
    jump: earlier ? multiply(earlier.jump, add.jump) : add.jump,
  });
}

/**
 * Turns the latest Reference Snapshot and the Action Interpretations into the
 * Adjustment Factors to apply. A Corporate Action whose description has no
 * interpretation (or one of an unsupported type) is skipped and reported, never
 * guessed. A "not price-relevant" one needs no factor and is not reported. A
 * rights issue takes its prior close from `priorClose`; without a Daily Bar
 * before its ex-date it is skipped and reported.
 */
export async function planAdjustments(
  referenceDir: string,
  startDate: string,
  decisions: Decision[],
  priorClose: PriorClose,
): Promise<AdjustmentPlan> {
  const [listed, interpretations] = await Promise.all([
    loadActions(referenceDir, startDate),
    loadInterpretations(referenceDir),
  ]);
  const actions = withoutRejected(listed, decisions);

  // Every row is shape-checked, applied or not; a wrong one is held for review.
  const outcomes = new Map<string, Outcome>();
  const rejected: RejectedInterpretation[] = [];
  for (const [description, interpretation] of interpretations) {
    try {
      outcomes.set(description, factorOf(interpretation));
    } catch (err) {
      if (!(err instanceof ShapeError)) throw err;
      rejected.push({ description, reason: err.message });
    }
  }

  const skipped: SkippedAction[] = [];
  const pending = new Set<string>();
  const combined = new Map<string, ExDateFactor>();
  for (const action of actions) {
    const interpretation = interpretations.get(action.description);
    let outcome: Outcome;
    if (!interpretation) {
      pending.add(action.description);
      outcome = { skip: "no Action Interpretation for this description" };
    } else if (outcomes.has(action.description)) {
      outcome = outcomes.get(action.description)!;
    } else {
      continue; // rejected for shape: reported once, for review
    }
    const resolved = await resolve(action, outcome, priorClose);
    if ("skip" in resolved) {
      skipped.push({ ...action, reason: resolved.skip });
      continue;
    }
    addFactor(combined, action.symbol, action.exDate, resolved);
  }

  // Actions a person added are not in NSE's list, and need no interpretation.
  for (const d of decisions) {
    if (d.kind === "add_action") addFactor(combined, d.symbol, d.date, { factor: d.factor, jump: d.factor });
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
  return { factors, skipped, pendingTexts: [...pending].sort(), rejected };
}
