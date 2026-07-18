/**
 * Foreman preference store — read/write `.foreman/preferences.json`.
 * Agents run the questionnaire; this module validates and persists answers.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { preferencesPath, FOREMAN_DIR } from "./lib/paths.js";
import {
  detectStack,
  NODE_PACKAGE_MANAGERS,
  PYTHON_PACKAGE_MANAGERS,
} from "./detect.js";
import { detectGitRemote, repoNameFromRemote } from "./git-remote.js";
import { enrichWithExa } from "./exa-enrich.js";

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
 * Questionnaire chrome (title/intro/redo) — fun vs boring.
 * @param {"fun" | "boring"} vibe
 */
export function questionnaireChrome(vibe = "fun") {
  if (vibe === "boring") {
    return {
      title: "Foreman preferences",
      intro:
        "Answer a short questionnaire so Foreman can tailor scan, build, and contribute workflows. Answers are stored in .foreman/preferences.json (local only).",
      redo: "Preferences already saved. Reply \"redo\" to re-run the questionnaire, or continue to scan.",
    };
  }

  return {
    title: "🚧 Hard-hat check — quick site prefs",
    intro:
      "Before we survey the job site, tell the foreman how you run this crew. Answers land in `.foreman/preferences.json` (git-ignored / exclude-listed — no PR pollution).",
    redo: "Prefs already on file 📋. Say **redo** to re-run the questionnaire, or keep rolling into the scan.",
  };
}

/**
 * @deprecated Prefer buildQuestionnaire — kept for callers that only need static chrome + all questions.
 * @param {"fun" | "boring"} vibe
 */
export function questionnaireCopy(vibe = "fun") {
  const chrome = questionnaireChrome(vibe);
  const boring = vibe === "boring";
  return {
    ...chrome,
    questions: PREFERENCE_QUESTIONS.map((q) => ({
      id: q.id,
      prompt: boring ? q.promptBoring : q.prompt,
      options: q.options.map((id) => ({ id, label: id })),
      allowMultiple: false,
      required: q.required,
      default: q.default,
    })),
  };
}

const PM_LABELS = {
  npm: "npm",
  pnpm: "pnpm",
  yarn: "yarn",
  bun: "bun",
  pip: "pip",
  uv: "uv",
  poetry: "poetry",
  cargo: "cargo",
  go: "go",
  other: "other",
};

const VCS_LABELS = {
  github: "GitHub",
  gitlab: "GitLab",
  bitbucket: "Bitbucket",
  other: "Other",
};

const ISSUE_LABELS = {
  "github-issues": "GitHub Issues",
  jira: "Jira",
  linear: "Linear",
  trello: "Trello",
  none: "None",
};

/**
 * Filter package-manager options to the stack(s) detected.
 * @param {{ languages: string[], packageManagers: string[] }} stack
 * @returns {string[]}
 */
export function packageManagerOptionsForStack(stack) {
  const langs = new Set(stack.languages || []);
  const hasNode = langs.has("javascript") || langs.has("typescript");
  const hasPython = langs.has("python");
  const hasGo = langs.has("go");
  const hasRust = langs.has("rust");
  const opts = [];

  if (hasNode) opts.push(...NODE_PACKAGE_MANAGERS);
  if (hasPython) opts.push(...PYTHON_PACKAGE_MANAGERS.filter((p) => p !== "pipenv"));
  if (hasGo) opts.push("go");
  if (hasRust) opts.push("cargo");

  if (opts.length === 0) {
    // Unknown / empty — offer common set without dumping every ecosystem at once
    return ["npm", "pnpm", "yarn", "bun", "pip", "uv", "poetry", "cargo", "go", "other"];
  }

  if (!opts.includes("other")) opts.push("other");
  return [...new Set(opts)];
}

/**
 * @param {string[]} optionIds
 * @param {Record<string, string>} labels
 * @param {string | null} [preferFirst]
 */
function toAskOptions(optionIds, labels, preferFirst = null) {
  const ordered = [...optionIds];
  if (preferFirst && ordered.includes(preferFirst)) {
    ordered.splice(ordered.indexOf(preferFirst), 1);
    ordered.unshift(preferFirst);
  }
  return ordered.map((id) => ({ id, label: labels[id] || id }));
}

/**
 * Build a context-aware questionnaire for AskQuestion UX.
 * @param {string} repoRoot
 * @param {{ vibe?: "fun" | "boring", enrichment?: object | null }} [opts]
 */
export async function buildQuestionnaire(repoRoot, opts = {}) {
  const vibe = opts.vibe || "fun";
  const boring = vibe === "boring";
  const stack = await detectStack(repoRoot);
  const remote = detectGitRemote(repoRoot);
  const enrichment = opts.enrichment ?? null;

  const suggestedVcs =
    remote.suggestedVcs ||
    (enrichment?.suggestedVcs && VCS_PLATFORMS.includes(enrichment.suggestedVcs)
      ? enrichment.suggestedVcs
      : null);

  const suggestedIssues =
    enrichment?.suggestedIssues && ISSUE_MANAGERS.includes(enrichment.suggestedIssues)
      ? enrichment.suggestedIssues
      : suggestedVcs === "github"
        ? "github-issues"
        : null;

  /** @type {Record<string, unknown>} */
  const defaults = {};
  const questions = [];

  // Package manager: auto-fill when unambiguous
  const clearPm =
    stack.preferredPackageManager &&
    !stack.packageManagerAmbiguous &&
    PACKAGE_MANAGERS.includes(stack.preferredPackageManager);

  if (clearPm) {
    defaults.packageManager = stack.preferredPackageManager;
  } else if (stack.packageManagerAmbiguous || stack.packageManagers.length > 0) {
    const pmOpts = packageManagerOptionsForStack(stack);
    questions.push({
      id: "packageManager",
      prompt: boring
        ? stack.packageManagerAmbiguous
          ? `Multiple package managers detected (${stack.packageManagers.join(", ")}). Which should Foreman prefer?`
          : "Preferred package manager?"
        : stack.packageManagerAmbiguous
          ? `🚧 Lockfile pile-up (${stack.lockfiles.join(", ") || stack.packageManagers.join(", ")}). Which package manager wins?`
          : "Package manager for this crew?",
      options: toAskOptions(pmOpts, PM_LABELS, stack.preferredPackageManager),
      allowMultiple: false,
      required: false,
      suggested: stack.preferredPackageManager || null,
    });
  } else if (stack.manifests.length === 0 && stack.languages.length === 0) {
    // Empty / unknown — skip PM (null) rather than dumping the full list
    defaults.packageManager = null;
  }

  // VCS — always ask, but contextualize + suggest
  {
    let prompt;
    if (boring) {
      prompt = suggestedVcs
        ? `Remote looks like ${VCS_LABELS[suggestedVcs] || suggestedVcs}${remote.remoteUrl ? ` (${remote.remoteUrl})` : ""}. Confirm version control platform?`
        : "Which version control platform do you use?";
    } else {
      prompt = suggestedVcs
        ? `Remote smells like ${VCS_LABELS[suggestedVcs] || suggestedVcs}${remote.remoteUrl ? ` (\`${remote.remoteUrl}\`)` : ""}. Confirm VCS?`
        : "Version control platform?";
    }
    questions.push({
      id: "vcs",
      prompt,
      options: toAskOptions([...VCS_PLATFORMS], VCS_LABELS, suggestedVcs),
      allowMultiple: false,
      required: true,
      suggested: suggestedVcs,
    });
  }

  // Issues — always ask; bias order from VCS / Exa
  {
    const issuePrefer =
      suggestedIssues ||
      (suggestedVcs === "github" ? "github-issues" : null);
    questions.push({
      id: "issues",
      prompt: boring
        ? enrichment?.suggestedIssues
          ? `Web hints suggest ${ISSUE_LABELS[enrichment.suggestedIssues] || enrichment.suggestedIssues}. Where do you track issues?`
          : "Where do you track issues?"
        : enrichment?.suggestedIssues
          ? `Foreman sniffed ${ISSUE_LABELS[enrichment.suggestedIssues] || enrichment.suggestedIssues} online. Issue tracker?`
          : "Issue management?",
      options: toAskOptions([...ISSUE_MANAGERS], ISSUE_LABELS, issuePrefer),
      allowMultiple: false,
      required: true,
      suggested: issuePrefer,
    });
  }

  // Vibe last
  questions.push({
    id: "vibe",
    prompt: boring ? "Copy style: fun or boring?" : "Vibe — fun 🚧 or boring (professional)?",
    options: [
      { id: "fun", label: boring ? "fun" : "fun 🚧" },
      { id: "boring", label: boring ? "boring" : "boring (professional)" },
    ],
    allowMultiple: false,
    required: true,
    suggested: "fun",
    default: "fun",
  });

  // Stable order: vcs → issues → packageManager (if any) → vibe
  const order = ["vcs", "issues", "packageManager", "vibe"];
  questions.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));

  const contextLine = formatContextLine(stack, remote, defaults);

  return {
    chrome: questionnaireChrome(vibe),
    context: {
      languages: stack.languages,
      frameworks: stack.frameworks,
      lockfiles: stack.lockfiles,
      manifests: stack.manifests,
      packageManagers: stack.packageManagers,
      preferredPackageManager: stack.preferredPackageManager,
      packageManagerAmbiguous: stack.packageManagerAmbiguous,
      remoteUrl: remote.remoteUrl,
      suggestedVcs,
      repoName: repoNameFromRemote(remote.remoteUrl),
      summary: contextLine,
    },
    defaults,
    questions,
    ux: {
      mode: "ask-question",
      onePerTurn: true,
      fallback: "numbered-options",
      instruction:
        "Use AskQuestion for each question (one per turn). Never ask the user to reply with a slash-separated freeform string. Apply defaults silently before asking.",
    },
    copy: {
      ...questionnaireChrome(vibe),
      intro: `${questionnaireChrome(vibe).intro}\n\nDetected: ${contextLine}`,
      questions,
    },
  };
}

/**
 * @param {import("./detect.js").StackDetection} stack
 * @param {{ remoteUrl: string | null, suggestedVcs: string | null }} remote
 * @param {Record<string, unknown>} defaults
 */
function formatContextLine(stack, remote, defaults) {
  const parts = [];
  if (stack.languages.length) parts.push(stack.languages.join("+"));
  else parts.push("unknown stack");
  if (stack.lockfiles.length) parts.push(stack.lockfiles.join(", "));
  else if (defaults.packageManager) parts.push(String(defaults.packageManager));
  else if (stack.preferredPackageManager) parts.push(stack.preferredPackageManager);
  if (remote.suggestedVcs) parts.push(`remote→${remote.suggestedVcs}`);
  return parts.join(" · ");
}

/**
 * Full questionnaire payload for CLI (includes optional Exa).
 * @param {string} repoRoot
 * @param {{ vibe?: "fun" | "boring" }} [opts]
 */
export async function buildQuestionnairePayload(repoRoot, opts = {}) {
  const remote = detectGitRemote(repoRoot);
  const enrichment = await enrichWithExa({
    remoteUrl: remote.remoteUrl,
    repoName: repoNameFromRemote(remote.remoteUrl),
  });

  // Local detect wins for package manager; Exa may soft-suggest VCS/issues only
  const built = await buildQuestionnaire(repoRoot, {
    vibe: opts.vibe || "fun",
    enrichment: enrichment.used && !enrichment.error ? enrichment : null,
  });

  return {
    ...built,
    enrichment: {
      used: enrichment.used,
      ...(enrichment.error ? { error: enrichment.error } : {}),
      ...(enrichment.suggestedVcs ? { suggestedVcs: enrichment.suggestedVcs } : {}),
      ...(enrichment.suggestedIssues ? { suggestedIssues: enrichment.suggestedIssues } : {}),
      ...(enrichment.urls ? { urls: enrichment.urls } : {}),
      ...(enrichment.summary ? { summary: enrichment.summary } : {}),
    },
  };
}
