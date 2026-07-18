/**
 * Detect VCS platform from git remotes (best-effort, no network).
 */

import { spawnSync } from "node:child_process";
import path from "node:path";

/**
 * @param {string} repoRoot
 * @returns {{ remoteUrl: string | null, suggestedVcs: string | null, remotes: string[] }}
 */
export function detectGitRemote(repoRoot) {
  const root = path.resolve(repoRoot);
  const empty = { remoteUrl: null, suggestedVcs: null, remotes: [] };

  try {
    const top = spawnSync("git", ["rev-parse", "--show-toplevel"], {
      cwd: root,
      encoding: "utf8",
      timeout: 5000,
    });
    if (top.status !== 0 || !top.stdout?.trim()) return empty;
    const toplevel = path.resolve(top.stdout.trim());
    // Only trust remotes when this directory is the git root (not a nested path/fixture).
    if (toplevel !== root) return empty;
  } catch {
    return empty;
  }

  const remotes = [];
  try {
    const listed = spawnSync("git", ["remote", "-v"], {
      cwd: root,
      encoding: "utf8",
      timeout: 5000,
    });
    if (listed.status === 0 && listed.stdout) {
      for (const line of listed.stdout.split("\n")) {
        const m = line.match(/^\S+\s+(\S+)/);
        if (m?.[1] && !remotes.includes(m[1])) remotes.push(m[1]);
      }
    }
  } catch {
    // ignore
  }

  let remoteUrl = null;
  try {
    const origin = spawnSync("git", ["remote", "get-url", "origin"], {
      cwd: root,
      encoding: "utf8",
      timeout: 5000,
    });
    if (origin.status === 0 && origin.stdout?.trim()) {
      remoteUrl = origin.stdout.trim();
    }
  } catch {
    // ignore
  }

  if (!remoteUrl && remotes[0]) remoteUrl = remotes[0];

  return {
    remoteUrl,
    suggestedVcs: classifyRemoteUrl(remoteUrl),
    remotes,
  };
}

/**
 * @param {string | null | undefined} url
 * @returns {"github" | "gitlab" | "bitbucket" | null}
 */
export function classifyRemoteUrl(url) {
  if (!url) return null;
  const u = url.toLowerCase();
  if (u.includes("github.com") || u.includes("github.")) return "github";
  if (u.includes("gitlab.com") || u.includes("gitlab.")) return "gitlab";
  if (u.includes("bitbucket.org") || u.includes("bitbucket.")) return "bitbucket";
  return null;
}

/**
 * Best-effort owner/repo name from a git remote URL.
 * @param {string | null | undefined} url
 */
export function repoNameFromRemote(url) {
  if (!url) return null;
  const cleaned = url.replace(/\.git$/i, "");
  const m =
    cleaned.match(/[:/]([^/]+\/[^/]+)$/) ||
    cleaned.match(/([^/\s]+\/[^/\s]+)$/);
  return m?.[1] || null;
}
