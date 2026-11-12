import path from "node:path";
import { PENDING_FILE } from "./adjustments";
import { build } from "./build";
import { FILES_DIR, MIGRATIONS_DIR, REFERENCE_DIR, START_DATE } from "./config";
import type { Db } from "./db";
import { connect } from "./db";
import { load } from "./load";
import { migrate } from "./migrate";
import { review } from "./review";

const commands = {
  async migrate(db: Db) {
    const applied = await migrate(db, MIGRATIONS_DIR);
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Nothing to migrate");
  },
  async load(db: Db) {
    const { files, rows } = await load(db, { filesDir: FILES_DIR, startDate: START_DATE });
    console.log(`Loaded ${rows} Staged Rows from ${files} Raw Files in ${FILES_DIR}`);
  },
  async build(db: Db) {
    const { bars, skippedActions, pendingTexts, rejectedInterpretations } = await build(db, {
      startDate: START_DATE,
      referenceDir: REFERENCE_DIR,
    });
    console.log(`Built ${bars} Daily Bars and the Adjusted layer`);
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
  async review(db: Db) {
    const items = await review(db, { startDate: START_DATE, referenceDir: REFERENCE_DIR });
    if (items.length === 0) {
      console.log("Nothing to review");
      return;
    }
    console.log(`${items.length} open item(s):`);
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
  },
};

const name = process.argv[2];
if (name === undefined || !(name in commands)) {
  console.error("Usage: cli <migrate|load|build|review>");
  process.exit(1);
}

const db = connect();
try {
  await commands[name as keyof typeof commands](db);
} finally {
  await db.end();
}
