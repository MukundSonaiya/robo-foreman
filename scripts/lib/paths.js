import path from "node:path";

/** Relative paths Foreman writes into a target repo (also used for exclude/guards). */
export const FOREMAN_DIR = ".foreman";
export const PREFERENCES_FILE = "preferences.json";
export const REPORT_FILE = "report.md";
export const BACKUP_DIR = "backup";

export function foremanRoot(repoRoot) {
  return path.join(repoRoot, FOREMAN_DIR);
}

export function preferencesPath(repoRoot) {
  return path.join(foremanRoot(repoRoot), PREFERENCES_FILE);
}

export function reportPath(repoRoot) {
  return path.join(foremanRoot(repoRoot), REPORT_FILE);
}

export function backupRoot(repoRoot) {
  return path.join(foremanRoot(repoRoot), BACKUP_DIR);
}

/** Paths that must never appear in an OSS contribution diff. */
export const POLLUTION_PATHS = [
  ".foreman/",
  ".foreman/**",
];
