#!/usr/bin/env node
/**
 * Install Robo Foreman into Cursor's local plugin directory.
 *
 * Cursor rejects symlinks whose target is outside ~/.cursor/plugins/local
 * (see pluginsSubsystem: "symlink target … is outside …/local"). Copy the
 * plugin tree into place instead.
 *
 * Usage:
 *   node scripts/install-cursor-plugin.js
 *   npm run install:cursor
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PLUGIN_NAME = "robo-foreman";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE_ROOT = path.resolve(__dirname, "..");
const DEST_ROOT = path.join(os.homedir(), ".cursor", "plugins", "local", PLUGIN_NAME);

const SKIP_NAMES = new Set([
  ".git",
  ".gitignore",
  "tests",
  "docs",
  "node_modules",
  "package-lock.json",
]);

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function ensureSourceLooksLikePlugin() {
  const manifest = path.join(SOURCE_ROOT, ".cursor-plugin", "plugin.json");
  if (!fs.existsSync(manifest)) {
    fail(`missing plugin manifest at ${manifest}`);
  }
}

function ensureDeps() {
  const nm = path.join(SOURCE_ROOT, "node_modules");
  if (fs.existsSync(nm)) return;
  console.log("Installing npm dependencies in source checkout…");
  const result = spawnSync("npm", ["install"], {
    cwd: SOURCE_ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (result.status !== 0) fail("npm install failed");
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function copyTree(src, dest) {
  const stat = fs.lstatSync(src);
  if (stat.isSymbolicLink()) {
    // Never follow external links into the install dir.
    return;
  }
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      if (SKIP_NAMES.has(entry)) continue;
      copyTree(path.join(src, entry), path.join(dest, entry));
    }
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyNodeModules() {
  const src = path.join(SOURCE_ROOT, "node_modules");
  const dest = path.join(DEST_ROOT, "node_modules");
  if (!fs.existsSync(src)) fail("node_modules missing after npm install");

  // Prefer rsync when available (faster + preserves structure); fall back to cp -R / Node copy.
  const rsync = spawnSync(
    "rsync",
    ["-a", "--delete", `${src}/`, `${dest}/`],
    { stdio: "ignore" },
  );
  if (rsync.status === 0) return;

  if (process.platform === "win32") {
    copyTree(src, dest);
    return;
  }

  fs.mkdirSync(dest, { recursive: true });
  const cp = spawnSync("cp", ["-R", `${src}/.`, dest], { stdio: "ignore" });
  if (cp.status !== 0) {
    // Last resort: recursive Node copy (slow but portable).
    SKIP_NAMES.delete("node_modules");
    copyTree(src, dest);
    SKIP_NAMES.add("node_modules");
  }
}

function copyPackageLock() {
  const lock = path.join(SOURCE_ROOT, "package-lock.json");
  if (fs.existsSync(lock)) {
    fs.copyFileSync(lock, path.join(DEST_ROOT, "package-lock.json"));
  }
}

function main() {
  ensureSourceLooksLikePlugin();
  ensureDeps();

  fs.mkdirSync(path.dirname(DEST_ROOT), { recursive: true });

  try {
    fs.lstatSync(DEST_ROOT);
    console.log(`Removing previous install at ${DEST_ROOT}`);
    rmrf(DEST_ROOT);
  } catch {
    // nothing to remove
  }

  console.log(`Copying plugin → ${DEST_ROOT}`);
  fs.mkdirSync(DEST_ROOT, { recursive: true });
  copyTree(SOURCE_ROOT, DEST_ROOT);
  copyPackageLock();
  copyNodeModules();

  // Guard: must be a real directory, not a symlink outside local/
  const destStat = fs.lstatSync(DEST_ROOT);
  if (destStat.isSymbolicLink()) {
    fail("install left a symlink; Cursor will reject it. Re-run after removing the link.");
  }

  const destManifest = path.join(DEST_ROOT, ".cursor-plugin", "plugin.json");
  if (!fs.existsSync(destManifest)) {
    fail("install incomplete: plugin.json missing in destination");
  }

  console.log(`
Installed ${PLUGIN_NAME} to:
  ${DEST_ROOT}

Next:
  1. In Cursor: Command Palette → "Developer: Reload Window"
  2. Confirm Robo Foreman under Customize → Plugins
  3. Confirm /scan, /build, /contribute in the Agent / menu

Note: Cursor rejects symlinks that point outside ~/.cursor/plugins/local.
Re-run \`npm run install:cursor\` after editing this checkout so the copy stays in sync.
`);
}

main();
