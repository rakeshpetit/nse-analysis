import { build } from "./build";
import { FILES_DIR, MIGRATIONS_DIR, REFERENCE_DIR, START_DATE } from "./config";
import type { Db } from "./db";
import { connect } from "./db";
import { load } from "./load";
import { migrate } from "./migrate";

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
    const { bars, skippedActions } = await build(db, {
      startDate: START_DATE,
      referenceDir: REFERENCE_DIR,
    });
    console.log(`Built ${bars} Daily Bars and the Adjusted layer`);
    if (skippedActions.length > 0) {
      console.warn(`Skipped ${skippedActions.length} Corporate Action(s) (no adjustment applied):`);
      for (const a of skippedActions) {
        console.warn(`  ${a.exDate} ${a.symbol}: "${a.description}" - ${a.reason}`);
      }
    }
  },
};

const name = process.argv[2];
if (name === undefined || !(name in commands)) {
  console.error("Usage: cli <migrate|load|build>");
  process.exit(1);
}

const db = connect();
try {
  await commands[name as keyof typeof commands](db);
} finally {
  await db.end();
}
