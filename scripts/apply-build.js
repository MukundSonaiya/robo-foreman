/**
 * Apply a build plan after user confirmation (used by /build skill).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createBackup, DEFAULT_BACKUP_PATHS } from "./backup.js";
import { mergeMcpConfig, mergeHooksConfig } from "./merge.js";
import { ensureGitExclude } from "./git-exclude.js";
import { planBuild } from "./build-plan.js";

/**
 * @param {string} repoRoot
 * @param {{ selectedPaths?: string[] | null, dryRun?: boolean, oss?: boolean }} [opts]
 */
export async function applyBuild(repoRoot, opts = {}) {
  const plan = await planBuild(repoRoot);
  const selected = opts.selectedPaths
    ? plan.files.filter((f) => opts.selectedPaths.includes(f.path))
    : plan.files;

  if (opts.dryRun) {
    return { dryRun: true, plan, selected };
  }

  const backup = await createBackup(repoRoot, DEFAULT_BACKUP_PATHS, { label: "pre-build" });
  await ensureGitExclude(repoRoot, { extraOss: Boolean(opts.oss) });

  const written = [];
  for (const file of selected) {
    const abs = path.join(repoRoot, file.path);
    if (file.action === "write" || file.action === "delete-after-migrate") {
      if (file.action === "delete-after-migrate") {
        // handled after migrated file is written — skip content write
        continue;
      }
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, file.content, "utf8");
      if (file.executable) await fs.chmod(abs, 0o755);
      written.push(file.path);
    } else if (file.action === "merge-mcp") {
      let existing = {};
      try {
        existing = JSON.parse(await fs.readFile(abs, "utf8"));
      } catch {
        existing = {};
      }
      const incoming = JSON.parse(file.content);
      const merged = mergeMcpConfig(existing, incoming);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
      written.push(file.path);
    } else if (file.action === "merge-hooks") {
      let existing = {};
      try {
        existing = JSON.parse(await fs.readFile(abs, "utf8"));
      } catch {
        existing = {};
      }
      const incoming = JSON.parse(file.content);
      const merged = mergeHooksConfig(existing, incoming);
      await fs.mkdir(path.dirname(abs), { recursive: true });
      await fs.writeFile(abs, `${JSON.stringify(merged, null, 2)}\n`, "utf8");
      written.push(file.path);
    }
  }

  // Delete legacy .cursorrules only if migrated file was selected
  const migrated = selected.some((f) => f.path.includes("migrated-cursorrules"));
  const deleteLegacy = selected.some((f) => f.action === "delete-after-migrate");
  if (migrated && deleteLegacy) {
    try {
      await fs.unlink(path.join(repoRoot, ".cursorrules"));
      written.push(".cursorrules (deleted after migrate)");
    } catch {
      /* ignore */
    }
  }

  return { backup, written, plan, selected };
}
