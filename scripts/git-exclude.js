/**
 * OSS no-pollution: manage `.git/info/exclude` (not `.gitignore`).
 */

import fs from "node:fs/promises";
import path from "node:path";

export const FOREMAN_EXCLUDE_MARKER_START = "# >>> robo-foreman";
export const FOREMAN_EXCLUDE_MARKER_END = "# <<< robo-foreman";

/** Paths that must never appear in someone else's PR. */
export const DEFAULT_EXCLUDE_PATTERNS = [
  ".foreman/",
  ".foreman/**",
];

/**
 * Optional: when user does not own the repo, also exclude generated agent config
 * that Foreman may have written locally for contribute workflows.
 */
export const OSS_EXTRA_EXCLUDE_PATTERNS = [
  ".cursor/rules/foreman-*.mdc",
  ".cursor/rules/no-slop.mdc",
  ".cursor/hooks/foreman-*",
  "docs/PLANS/issue-*.md",
];

/**
 * @param {string} repoRoot
 */
export function excludeFilePath(repoRoot) {
  return path.join(repoRoot, ".git", "info", "exclude");
}

/**
 * Ensure Foreman patterns exist in `.git/info/exclude`.
 * @param {string} repoRoot
 * @param {{ patterns?: string[], extraOss?: boolean }} [opts]
 */
export async function ensureGitExclude(repoRoot, opts = {}) {
  const patterns = [
    ...(opts.patterns || DEFAULT_EXCLUDE_PATTERNS),
    ...(opts.extraOss ? OSS_EXTRA_EXCLUDE_PATTERNS : []),
  ];
  const file = excludeFilePath(repoRoot);
  await fs.mkdir(path.dirname(file), { recursive: true });

  let existing = "";
  try {
    existing = await fs.readFile(file, "utf8");
  } catch (err) {
    if (!(err && typeof err === "object" && "code" in err && err.code === "ENOENT")) {
      throw err;
    }
  }

  const block = [
    FOREMAN_EXCLUDE_MARKER_START,
    ...patterns,
    FOREMAN_EXCLUDE_MARKER_END,
  ].join("\n");

  if (existing.includes(FOREMAN_EXCLUDE_MARKER_START)) {
    const updated = existing.replace(
      new RegExp(
        `${escapeRegex(FOREMAN_EXCLUDE_MARKER_START)}[\\s\\S]*?${escapeRegex(FOREMAN_EXCLUDE_MARKER_END)}`,
        "m",
      ),
      block,
    );
    await fs.writeFile(file, ensureTrailingNewline(updated), "utf8");
    return { file, action: "updated", patterns };
  }

  const next = existing.trimEnd()
    ? `${existing.trimEnd()}\n\n${block}\n`
    : `${block}\n`;
  await fs.writeFile(file, next, "utf8");
  return { file, action: "created", patterns };
}

/**
 * Check whether a relative path would be pollution (should not be staged).
 * @param {string} relPath
 * @param {string[]} [patterns]
 */
export function isPollutionPath(relPath, patterns = DEFAULT_EXCLUDE_PATTERNS) {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
  for (const pat of patterns) {
    if (matchGitIgnoreStyle(normalized, pat)) return true;
  }
  // Always block .foreman even if patterns customized away
  if (normalized === ".foreman" || normalized.startsWith(".foreman/")) return true;
  return false;
}

/**
 * Filter a list of staged paths; return those that violate no-pollution.
 * @param {string[]} stagedPaths
 */
export function findPollutionInStaged(stagedPaths, patterns = DEFAULT_EXCLUDE_PATTERNS) {
  return stagedPaths.filter((p) => isPollutionPath(p, patterns));
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function ensureTrailingNewline(s) {
  return s.endsWith("\n") ? s : `${s}\n`;
}

/** Minimal gitignore-style matcher for our fixed patterns. */
function matchGitIgnoreStyle(filePath, pattern) {
  let pat = pattern.replace(/\\/g, "/");
  if (pat.endsWith("/")) {
    const dir = pat.slice(0, -1);
    return filePath === dir || filePath.startsWith(`${dir}/`);
  }
  if (pat.endsWith("/**")) {
    const dir = pat.slice(0, -3);
    return filePath === dir || filePath.startsWith(`${dir}/`);
  }
  if (pat.includes("*")) {
    const re = new RegExp(
      `^${pat
        .split("*")
        .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*")}$`,
    );
    return re.test(filePath) || re.test(path.basename(filePath));
  }
  return filePath === pat || filePath.endsWith(`/${pat}`);
}
