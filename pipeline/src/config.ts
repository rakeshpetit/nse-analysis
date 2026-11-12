import path from "node:path";
import { fileURLToPath } from "node:url";

/** Trading Days before this date are out of scope (ADR 0002). */
export const START_DATE = "2024-09-01";

/**
 * A day-over-day Adjusted Price move bigger than this fraction (0.2 = 20%) with no
 * Corporate Action to explain it is a Suspected Break. Override with JUMP_THRESHOLD.
 */
export const JUMP_THRESHOLD = Number(process.env.JUMP_THRESHOLD ?? "0.2");
if (!(JUMP_THRESHOLD > 0)) {
  throw new Error(`JUMP_THRESHOLD must be a positive number such as 0.2, got "${process.env.JUMP_THRESHOLD}"`);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Directory holding the Raw Files. Override with FILES_DIR. */
export const FILES_DIR = process.env.FILES_DIR ?? path.join(repoRoot, "files");

/** Directory holding Reference Snapshots and Action Interpretations. Override with REFERENCE_DIR. */
export const REFERENCE_DIR = process.env.REFERENCE_DIR ?? path.join(repoRoot, "reference");

export const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../migrations",
);
