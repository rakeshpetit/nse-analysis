import path from "node:path";
import { PENDING_FILE } from "./adjustments";
import { build } from "./build";
import { daily, formatSummary } from "./daily";
import { DECISIONS_FILE } from "./decisions";
import { formatFetchResult, fetchInputs, todayIst } from "./fetch";
import { nseHttp } from "./nseHttp";
import { FILES_DIR, MCAP_START_DATE, MIGRATIONS_DIR, REFERENCE_DIR, REVIEW_DIR, START_DATE } from "./config";
import type { Db } from "./db";
import { connect } from "./db";
import { load } from "./load";
import { migrate } from "./migrate";
import { formatMarketCapMismatches, marketCapMismatches, review } from "./review";

/** Downloads new Raw Files and today's Reference Snapshots; prints what happened and returns whether all went well. */
async function fetchAll(): Promise<boolean> {
  const result = await fetchInputs({
    filesDir: FILES_DIR,
    referenceDir: REFERENCE_DIR,
    startDate: START_DATE,
    mcapStartDate: MCAP_START_DATE,
    today: todayIst(),
    http: nseHttp(),
    delayMs: 1000,
  });
  const lines = formatFetchResult(result);
  for (const line of lines) (result.failures.length > 0 ? console.warn : console.log)(line);
  return result.failures.length === 0;
}

const commands = {
  async fetch() {
    if (!(await fetchAll())) process.exitCode = 1;
  },
  async migrate(db: Db) {
    const applied = await migrate(db, MIGRATIONS_DIR);
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Nothing to migrate");
  },
  async load(db: Db) {
    const { files, rows } = await load(db, { filesDir: FILES_DIR, startDate: START_DATE });
    console.log(`Loaded ${rows} Staged Rows from ${files} Raw Files in ${FILES_DIR}`);
  },
  async build(db: Db) {
    const { bars, skippedActions, pendingTexts, rejectedInterpretations, decisions } = await build(db, {
      startDate: START_DATE,
      referenceDir: REFERENCE_DIR,
      reviewDir: REVIEW_DIR,
    });
    console.log(`Built ${bars} Daily Bars and the Adjusted layer`);
    if (decisions > 0) console.log(`Applied ${decisions} Review Decision(s) from ${path.join(REVIEW_DIR, DECISIONS_FILE)}`);
    if (pendingTexts.length > 0) {
      console.warn(
        `${pendingTexts.length} texts need interpreting: run /interpret-corporate-actions in Claude Code ` +
          `(they are listed in ${path.join(REFERENCE_DIR, PENDING_FILE)})`,
      );
    }
    if (rejectedInterpretations.length > 0) {
      console.warn(`Rejected ${rejectedInterpretations.length} Action Interpretation(s) with the wrong shape (not applied):`);
      for (const r of rejectedInterpretations) console.warn(`  "${r.description}" - ${r.reason}`);
    }
    if (skippedActions.length > 0) {
      console.warn(`Skipped ${skippedActions.length} Corporate Action(s) (no adjustment applied):`);
      for (const a of skippedActions) {
        console.warn(`  ${a.exDate} ${a.symbol}: "${a.description}" - ${a.reason}`);
      }
    }
  },
  async daily(db: Db) {
    // A failed fetch is reported, not fatal: daily carries on with what is on disk.
    const summary = await daily(db, {
      fetch: async () => void (await fetchAll()),
      filesDir: FILES_DIR,
      referenceDir: REFERENCE_DIR,
      reviewDir: REVIEW_DIR,
      startDate: START_DATE,
    });
    console.log(formatSummary(summary));
  },
  async review(db: Db) {
    const items = await review(db, { startDate: START_DATE, referenceDir: REFERENCE_DIR, reviewDir: REVIEW_DIR });
    const mismatchLines = formatMarketCapMismatches(await marketCapMismatches(db));
    if (items.length === 0) console.log("Nothing to review");
    else console.log(`${items.length} open item(s):`);
    for (const item of items) {
      console.log(`\n[${item.id}] ${item.summary}`);
      for (const line of item.detail) console.log(`  ${line}`);
      if (item.prices && item.prices.length > 0) {
        console.log("  date        open        close   adj. close");
        for (const p of item.prices) {
          const mark = p.tradeDate === item.date ? "*" : " ";
          const num = (v: string) => Number(v).toFixed(2).padStart(10);
          console.log(` ${mark}${p.tradeDate} ${num(p.open)} ${num(p.close)} ${num(p.adjustedClose)}`);
        }
      }
    }
    for (const line of mismatchLines) console.log(line);
  },
};

const name = process.argv[2];
if (name === undefined || !(name in commands)) {
  console.error("Usage: cli <fetch|migrate|load|build|review|daily>");
  process.exit(1);
}

if (name === "fetch") {
  await commands.fetch(); // needs no database
} else {
  const db = connect();
  try {
    await commands[name as Exclude<keyof typeof commands, "fetch">](db);
  } finally {
    await db.end();
  }
}
