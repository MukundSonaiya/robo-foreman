/**
 * Thin wrappers around gh / glab (and REST fallbacks) for /contribute.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/**
 * @param {string} bin
 * @param {string[]} args
 * @param {{ cwd?: string, env?: NodeJS.ProcessEnv }} [opts]
 */
export async function runCli(bin, args, opts = {}) {
  try {
    const { stdout, stderr } = await execFileAsync(bin, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      maxBuffer: 5 * 1024 * 1024,
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim(), bin };
  } catch (err) {
    const e = /** @type {Error & { stdout?: string, stderr?: string, code?: number }} */ (err);
    return {
      ok: false,
      stdout: (e.stdout || "").trim(),
      stderr: (e.stderr || e.message || "").trim(),
      code: e.code,
      bin,
    };
  }
}

/**
 * @param {{ vcs?: string }} prefs
 */
export function pickGitCli(prefs) {
  if (prefs?.vcs === "gitlab") return "glab";
  if (prefs?.vcs === "github") return "gh";
  return "gh";
}

/**
 * List open issues labeled good-first-issue / help-wanted when possible.
 * @param {{ vcs?: string, issues?: string }} prefs
 * @param {{ cwd?: string, limit?: number, repo?: string }} [opts]
 */
export async function listGoodFirstIssues(prefs, opts = {}) {
  const limit = opts.limit ?? 20;
  const bin = pickGitCli(prefs);

  if (prefs?.issues === "jira" || prefs?.issues === "linear") {
    return {
      ok: true,
      source: prefs.issues,
      issues: [],
      note: `Issue manager is ${prefs.issues} — use the matching MCP to list issues; CLI listing is unavailable here.`,
    };
  }

  if (bin === "gh") {
    const args = [
      "issue",
      "list",
      "--state",
      "open",
      "--limit",
      String(limit),
      "--json",
      "number,title,labels,assignees,comments,createdAt,url",
    ];
    if (opts.repo) args.push("--repo", opts.repo);
    const result = await runCli("gh", args, { cwd: opts.cwd });
    if (!result.ok) {
      return { ...result, source: "gh", issues: [], note: "gh failed — try GITHUB_TOKEN REST fallback in the skill." };
    }
    const issues = JSON.parse(result.stdout || "[]").map(normalizeGhIssue);
    return { ok: true, source: "gh", issues: rankIssues(issues), note: null };
  }

  if (bin === "glab") {
    const args = ["issue", "list", "-P", String(limit), "-F", "json"];
    const result = await runCli("glab", args, { cwd: opts.cwd });
    if (!result.ok) {
      return { ...result, source: "glab", issues: [], note: "glab failed — try GITLAB_TOKEN REST fallback." };
    }
    let parsed;
    try {
      parsed = JSON.parse(result.stdout || "[]");
    } catch {
      parsed = [];
    }
    const issues = (Array.isArray(parsed) ? parsed : []).map(normalizeGlabIssue);
    return { ok: true, source: "glab", issues: rankIssues(issues), note: null };
  }

  return { ok: false, source: "none", issues: [], note: "Unsupported VCS for issue listing" };
}

function normalizeGhIssue(i) {
  const labels = (i.labels || []).map((l) => (typeof l === "string" ? l : l.name));
  return {
    number: i.number,
    title: i.title,
    labels,
    assignees: (i.assignees || []).length,
    comments: i.comments ?? 0,
    createdAt: i.createdAt,
    url: i.url,
  };
}

function normalizeGlabIssue(i) {
  const labels = (i.labels || []).map((l) => (typeof l === "string" ? l : l.name));
  return {
    number: i.iid ?? i.id,
    title: i.title,
    labels,
    assignees: (i.assignees || []).length,
    comments: i.user_notes_count ?? 0,
    createdAt: i.created_at,
    url: i.web_url,
  };
}

/**
 * Rank issues: prefer good-first-issue / help wanted / unassigned; estimate difficulty.
 * @param {ReturnType<typeof normalizeGhIssue>[]} issues
 */
export function rankIssues(issues) {
  return [...issues]
    .map((issue) => {
      const labels = (issue.labels || []).map((l) => l.toLowerCase());
      const goodFirst = labels.some((l) => /good.?first|help.?wanted|beginner|easy|documentation/.test(l));
      const hard = labels.some((l) => /breaking|security|epic|difficult|hard/.test(l));
      const unassigned = (issue.assignees || 0) === 0;
      let difficulty = "medium";
      if (goodFirst && !hard) difficulty = "easy";
      if (hard) difficulty = "hard";
      if ((issue.comments || 0) > 15 && !goodFirst) difficulty = "medium-hard";

      let score = 0;
      if (goodFirst) score += 50;
      if (unassigned) score += 20;
      if (difficulty === "easy") score += 15;
      if (difficulty === "hard") score -= 20;
      score -= Math.min(issue.comments || 0, 30);
      // Prefer older unassigned good-first (less contested noise) slightly
      return { ...issue, difficulty, score, goodFirst, unassigned };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Heuristic: keyword search for likely files from an issue title/body.
 * @param {string} text
 * @param {string[]} filePaths
 */
export function rankLikelyFiles(text, filePaths) {
  const tokens = String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9_./-]+/)
    .filter((t) => t.length > 2);
  return filePaths
    .map((file) => {
      const f = file.toLowerCase();
      let hits = 0;
      for (const t of tokens) {
        if (f.includes(t)) hits += 1;
      }
      return { file, hits };
    })
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 12);
}

/**
 * Detect commit message style from recent subjects.
 * @param {string[]} subjects
 */
export function detectCommitStyle(subjects) {
  const samples = subjects.slice(0, 30);
  const conventional = samples.filter((s) => /^(feat|fix|docs|chore|test|refactor|perf|ci|build|style)(\(.+\))?!?:/.test(s));
  const ratio = samples.length ? conventional.length / samples.length : 0;
  return {
    style: ratio >= 0.5 ? "conventional" : "freeform",
    conventionalRatio: ratio,
    examples: samples.slice(0, 5),
  };
}
