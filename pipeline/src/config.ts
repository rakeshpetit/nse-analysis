import path from "node:path";
import { fileURLToPath } from "node:url";

/** Trading Days before this date are out of scope (ADR 0002). */
export const START_DATE = "2024-09-01";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** Directory holding the Raw Files. Override with FILES_DIR. */
export const FILES_DIR = process.env.FILES_DIR ?? path.join(repoRoot, "files");

/** Directory holding Reference Snapshots and Action Interpretations. Override with REFERENCE_DIR. */
export const REFERENCE_DIR = process.env.REFERENCE_DIR ?? path.join(repoRoot, "reference");

export const MIGRATIONS_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../migrations",
);
