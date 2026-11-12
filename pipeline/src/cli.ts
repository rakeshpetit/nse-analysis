import { build } from "./build";
import { FILES_DIR, MIGRATIONS_DIR, START_DATE } from "./config";
import { connect } from "./db";
import { load } from "./load";
import { migrate } from "./migrate";

const commands = {
  async migrate(db: ReturnType<typeof connect>) {
    const applied = await migrate(db, MIGRATIONS_DIR);
    console.log(applied.length ? `Applied: ${applied.join(", ")}` : "Nothing to migrate");
  },
  async load(db: ReturnType<typeof connect>) {
    const { files, rows } = await load(db, { filesDir: FILES_DIR, startDate: START_DATE });
    console.log(`Loaded ${rows} Staged Rows from ${files} Raw Files in ${FILES_DIR}`);
  },
  async build(db: ReturnType<typeof connect>) {
    const { bars } = await build(db, { startDate: START_DATE });
    console.log(`Built ${bars} Daily Bars`);
  },
};

const name = process.argv[2];
if (name !== "migrate" && name !== "load" && name !== "build") {
  console.error("Usage: cli <migrate|load|build>");
  process.exit(1);
}

const db = connect();
try {
  await commands[name](db);
} finally {
  await db.end();
}
