/**
 * Foreman preference store — read/write `.foreman/preferences.json`.
 * Agents run the questionnaire; this module validates and persists answers.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { preferencesPath, FOREMAN_DIR } from "./lib/paths.js";

export const VCS_PLATFORMS = Object.freeze([
  "github",
  "gitlab",
  "bitbucket",
  "other",
]);

export const ISSUE_MANAGERS = Object.freeze([
  "github-issues",
  "jira",
  "linear",
  "trello",
  "none",
]);

export const PACKAGE_MANAGERS = Object.freeze([
  "npm",
  "pnpm",
  "yarn",
  "bun",
  "pip",
  "uv",
  "poetry",
  "cargo",
  "go",
  "other",
]);

export const VIBES = Object.freeze(["fun", "boring"]);

export const PREFERENCE_QUESTIONS = Object.freeze([
  {
    id: "vcs",
    prompt: "Version control platform?",
    promptBoring: "Which version control platform do you use?",
    options: VCS_PLATFORMS,
    required: true,
  },
  {
    id: "issues",
    prompt: "Issue management?",
    promptBoring: "Where do you track issues?",
    options: ISSUE_MANAGERS,
    required: true,
  },
  {
    id: "packageManager",
    prompt: "Package manager preference? (skip if lockfile is unambiguous)",
    promptBoring: "Preferred package manager when lockfiles conflict?",
    options: PACKAGE_MANAGERS,
    required: false,
  },
  {
    id: "vibe",
    prompt: "Vibe — fun copy 🚧 or --boring professional?",
    promptBoring: "Copy style: fun or boring?",
    options: VIBES,
    required: true,
    default: "fun",
  },
]);

/**
 * @typedef {object} ForemanPreferences
 * @property {string} vcs
 * @property {string} issues
 * @property {string | null} [packageManager]
 * @property {"fun" | "boring"} vibe
 * @property {string} createdAt
 * @property {string} updatedAt
 * @property {number} version
 */

export function defaultPreferences(partial = {}) {
  const now = new Date().toISOString();
  return {
    version: 1,
    vcs: "github",
    issues: "github-issues",
    packageManager: null,
    vibe: "fun",
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

/**
 * Validate and normalize raw preference answers.
 * @param {Record<string, unknown>} raw
 * @returns {{ ok: true, value: ForemanPreferences } | { ok: false, errors: string[] }}
 */
export function validatePreferences(raw) {
  const errors = [];
  if (!raw || typeof raw !== "object") {
    return { ok: false, errors: ["preferences must be an object"] };
  }

  const vcs = String(raw.vcs ?? "");
  if (!VCS_PLATFORMS.includes(vcs)) {
    errors.push(`vcs must be one of: ${VCS_PLATFORMS.join(", ")}`);
  }

  const issues = String(raw.issues ?? "");
  if (!ISSUE_MANAGERS.includes(issues)) {
    errors.push(`issues must be one of: ${ISSUE_MANAGERS.join(", ")}`);
  }

  let packageManager = raw.packageManager ?? null;
  if (packageManager === "" || packageManager === undefined) {
    packageManager = null;
  }
  if (packageManager !== null && !PACKAGE_MANAGERS.includes(String(packageManager))) {
    errors.push(`packageManager must be one of: ${PACKAGE_MANAGERS.join(", ")} (or null)`);
  }

  const vibe = String(raw.vibe ?? "fun");
  if (!VIBES.includes(vibe)) {
    errors.push(`vibe must be one of: ${VIBES.join(", ")}`);
  }

  if (errors.length) return { ok: false, errors };

  const now = new Date().toISOString();
  return {
    ok: true,
    value: {
      version: 1,
      vcs,
      issues,
      packageManager: packageManager === null ? null : String(packageManager),
      vibe: /** @type {"fun" | "boring"} */ (vibe),
      createdAt: typeof raw.createdAt === "string" ? raw.createdAt : now,
      updatedAt: now,
    },
  };
}

/**
 * @param {string} repoRoot
 * @returns {Promise<ForemanPreferences | null>}
 */
export async function loadPreferences(repoRoot) {
  const file = preferencesPath(repoRoot);
  try {
    const text = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(text);
    const result = validatePreferences(parsed);
    if (!result.ok) {
      const err = new Error(`Invalid preferences at ${file}: ${result.errors.join("; ")}`);
      err.code = "FOREMAN_PREFS_INVALID";
      throw err;
    }
    // Preserve original timestamps from disk when valid
    return {
      ...result.value,
      createdAt: parsed.createdAt ?? result.value.createdAt,
      updatedAt: parsed.updatedAt ?? result.value.updatedAt,
    };
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * @param {string} repoRoot
 * @param {Record<string, unknown>} answers
 * @returns {Promise<ForemanPreferences>}
 */
export async function savePreferences(repoRoot, answers) {
  const existing = await loadPreferences(repoRoot).catch(() => null);
  const merged = {
    ...defaultPreferences(),
    ...(existing ?? {}),
    ...answers,
    createdAt: existing?.createdAt ?? new Date().toISOString(),
  };
  const result = validatePreferences(merged);
  if (!result.ok) {
    const err = new Error(`Cannot save preferences: ${result.errors.join("; ")}`);
    err.code = "FOREMAN_PREFS_INVALID";
    throw err;
  }

  const dir = path.join(repoRoot, FOREMAN_DIR);
  await fs.mkdir(dir, { recursive: true });
  const file = preferencesPath(repoRoot);
  await fs.writeFile(file, `${JSON.stringify(result.value, null, 2)}\n`, "utf8");
  return result.value;
}

/**
 * Whether the onboarding questionnaire should run.
 * @param {string} repoRoot
 * @param {{ force?: boolean }} [opts]
 */
export async function needsQuestionnaire(repoRoot, opts = {}) {
  if (opts.force) return true;
  const prefs = await loadPreferences(repoRoot);
  return prefs === null;
}

/**
 * Map preferences → recommended tooling hints for skills.
 * @param {ForemanPreferences} prefs
 */
export function toolingHints(prefs) {
  const hints = {
    gitCli: prefs.vcs === "gitlab" ? "glab" : prefs.vcs === "github" ? "gh" : "git",
    prNoun: prefs.vcs === "gitlab" ? "merge request" : "pull request",
    prFlag: prefs.vcs === "gitlab" ? "--draft" : "--draft",
    issueSource: prefs.issues,
    suggestedMcps: /** @type {string[]} */ ([]),
    branchPrefixHint:
      prefs.issues === "jira"
        ? "Use Jira key prefix when present (e.g. PROJ-123-short-slug)"
        : prefs.issues === "linear"
          ? "Use Linear identifier when present (e.g. eng-123-short-slug)"
          : "Follow repo CONTRIBUTING / recent branch names",
  };

  if (prefs.issues === "jira") hints.suggestedMcps.push("atlassian");
  if (prefs.issues === "linear") hints.suggestedMcps.push("linear");
  if (prefs.vcs === "gitlab") hints.suggestedMcps.push("gitlab");
  if (prefs.vcs === "github") hints.suggestedMcps.push("github");

  return hints;
}

/**
 * Questionnaire copy for the agent to present (fun vs boring).
 * @param {"fun" | "boring"} vibe
 */
export function questionnaireCopy(vibe = "fun") {
  if (vibe === "boring") {
    return {
      title: "Foreman preferences",
      intro:
        "Answer a short questionnaire so Foreman can tailor scan, build, and contribute workflows. Answers are stored in .foreman/preferences.json (local only).",
      redo: "Preferences already saved. Reply \"redo\" to re-run the questionnaire, or continue to scan.",
      questions: PREFERENCE_QUESTIONS.map((q) => ({
        id: q.id,
        prompt: q.promptBoring,
        options: q.options,
        required: q.required,
        default: q.default,
      })),
    };
  }

  return {
    title: "🚧 Hard-hat check — quick site prefs",
    intro:
      "Before we survey the job site, tell the foreman how you run this crew. Answers land in `.foreman/preferences.json` (git-ignored / exclude-listed — no PR pollution).",
    redo: "Prefs already on file 📋. Say **redo** to re-run the questionnaire, or keep rolling into the scan.",
    questions: PREFERENCE_QUESTIONS.map((q) => ({
      id: q.id,
      prompt: q.prompt,
      options: q.options,
      required: q.required,
      default: q.default,
    })),
  };
}
