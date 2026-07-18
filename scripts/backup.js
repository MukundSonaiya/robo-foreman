/**
 * Snapshot target files before Foreman writes; restore from latest backup.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { backupRoot, FOREMAN_DIR } from "./lib/paths.js";

/**
 * @param {string} repoRoot
 * @param {string[]} relativePaths — paths relative to repo root to snapshot
 * @param {{ label?: string }} [opts]
 * @returns {Promise<{ backupId: string, dir: string, saved: string[], missing: string[] }>}
 */
export async function createBackup(repoRoot, relativePaths, opts = {}) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupId = opts.label ? `${stamp}-${opts.label}` : stamp;
  const dir = path.join(backupRoot(repoRoot), backupId);
  await fs.mkdir(dir, { recursive: true });

  const saved = [];
  const missing = [];
  const manifest = [];

  for (const rel of relativePaths) {
    const src = path.join(repoRoot, rel);
    try {
      const stat = await fs.stat(src);
      if (stat.isDirectory()) {
        await copyDir(src, path.join(dir, rel));
      } else {
        await fs.mkdir(path.dirname(path.join(dir, rel)), { recursive: true });
        await fs.copyFile(src, path.join(dir, rel));
      }
      saved.push(rel);
      manifest.push({ path: rel, kind: stat.isDirectory() ? "dir" : "file" });
    } catch (err) {
      if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
        missing.push(rel);
        manifest.push({ path: rel, kind: "missing" });
      } else {
        throw err;
      }
    }
  }

  await fs.writeFile(
    path.join(dir, "manifest.json"),
    JSON.stringify(
      {
        backupId,
        createdAt: new Date().toISOString(),
        paths: manifest,
      },
      null,
      2,
    ) + "\n",
    "utf8",
  );

  return { backupId, dir, saved, missing };
}

/**
 * List backups newest-first.
 * @param {string} repoRoot
 */
export async function listBackups(repoRoot) {
  const root = backupRoot(repoRoot);
  try {
    const entries = await fs.readdir(root, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

/**
 * Restore files from a backup id (default: latest).
 * Only restores paths that existed in the backup (skips "missing").
 * @param {string} repoRoot
 * @param {{ backupId?: string }} [opts]
 */
export async function restoreBackup(repoRoot, opts = {}) {
  const ids = await listBackups(repoRoot);
  if (!ids.length) {
    const err = new Error("No Foreman backups found under .foreman/backup/");
    err.code = "FOREMAN_NO_BACKUP";
    throw err;
  }
  const backupId = opts.backupId || ids[0];
  const dir = path.join(backupRoot(repoRoot), backupId);
  const manifestText = await fs.readFile(path.join(dir, "manifest.json"), "utf8");
  const manifest = JSON.parse(manifestText);
  const restored = [];
  const skipped = [];

  for (const entry of manifest.paths || []) {
    if (entry.kind === "missing") {
      // File did not exist pre-write — remove if Foreman created it
      const target = path.join(repoRoot, entry.path);
      try {
        await fs.rm(target, { recursive: true, force: true });
        skipped.push({ path: entry.path, action: "removed-created" });
      } catch {
        skipped.push({ path: entry.path, action: "absent" });
      }
      continue;
    }
    const src = path.join(dir, entry.path);
    const dest = path.join(repoRoot, entry.path);
    if (entry.kind === "dir") {
      await fs.rm(dest, { recursive: true, force: true });
      await copyDir(src, dest);
    } else {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(src, dest);
    }
    restored.push(entry.path);
  }

  return { backupId, restored, skipped };
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const from = path.join(src, e.name);
    const to = path.join(dest, e.name);
    if (e.isDirectory()) await copyDir(from, to);
    else await fs.copyFile(from, to);
  }
}

/**
 * Default paths /build snapshots before mutating.
 */
export const DEFAULT_BACKUP_PATHS = [
  ".cursorrules",
  ".cursor/rules",
  ".cursor/mcp.json",
  ".cursor/hooks.json",
  ".cursor/hooks",
  "AGENTS.md",
  ".cursorignore",
  "mcp.json",
  "docs/PLANS",
];

export { FOREMAN_DIR };
