import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  validatePreferences,
  savePreferences,
  loadPreferences,
  needsQuestionnaire,
  toolingHints,
  questionnaireCopy,
  buildQuestionnaire,
  packageManagerOptionsForStack,
  defaultPreferences,
  VCS_PLATFORMS,
} from "./preferences.js";
import { preferencesPath } from "./lib/paths.js";
import { classifyRemoteUrl, repoNameFromRemote } from "./git-remote.js";
import { enrichWithExa } from "./exa-enrich.js";
import { resolvePackageManagerPreference } from "./detect.js";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, "..", "tests", "fixtures");

describe("validatePreferences", () => {
  it("accepts a full valid payload", () => {
    const result = validatePreferences({
      vcs: "github",
      issues: "linear",
      packageManager: "pnpm",
      vibe: "fun",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.vcs).toBe("github");
      expect(result.value.issues).toBe("linear");
      expect(result.value.packageManager).toBe("pnpm");
      expect(result.value.vibe).toBe("fun");
      expect(result.value.version).toBe(1);
    }
  });

  it("allows null packageManager", () => {
    const result = validatePreferences({
      vcs: "gitlab",
      issues: "none",
      packageManager: null,
      vibe: "boring",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.packageManager).toBeNull();
  });

  it("rejects unknown vcs", () => {
    const result = validatePreferences({
      vcs: "sourceforge",
      issues: "none",
      vibe: "fun",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatch(/vcs/);
  });

  it("rejects invalid vibe", () => {
    const result = validatePreferences({
      vcs: "github",
      issues: "github-issues",
      vibe: "chaotic",
    });
    expect(result.ok).toBe(false);
  });
});

describe("preferences persistence", () => {
  /** @type {string} */
  let tmp;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "foreman-prefs-"));
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("returns null when preferences file is missing", async () => {
    expect(await loadPreferences(tmp)).toBeNull();
    expect(await needsQuestionnaire(tmp)).toBe(true);
  });

  it("saves and reloads preferences", async () => {
    const saved = await savePreferences(tmp, {
      vcs: "gitlab",
      issues: "jira",
      packageManager: "uv",
      vibe: "boring",
    });
    expect(saved.vcs).toBe("gitlab");

    const loaded = await loadPreferences(tmp);
    expect(loaded).not.toBeNull();
    expect(loaded?.issues).toBe("jira");
    expect(loaded?.packageManager).toBe("uv");
    expect(loaded?.vibe).toBe("boring");

    const onDisk = await fs.readFile(preferencesPath(tmp), "utf8");
    expect(JSON.parse(onDisk).vcs).toBe("gitlab");
    expect(await needsQuestionnaire(tmp)).toBe(false);
  });

  it("force redo ignores existing file", async () => {
    await savePreferences(tmp, {
      vcs: "github",
      issues: "github-issues",
      vibe: "fun",
    });
    expect(await needsQuestionnaire(tmp, { force: true })).toBe(true);
  });

  it("preserves createdAt on update", async () => {
    const first = await savePreferences(tmp, {
      vcs: "github",
      issues: "github-issues",
      vibe: "fun",
    });
    // Ensure clock advances for updatedAt
    await new Promise((r) => setTimeout(r, 5));
    const second = await savePreferences(tmp, {
      vcs: "github",
      issues: "linear",
      vibe: "fun",
    });
    expect(second.createdAt).toBe(first.createdAt);
    expect(second.issues).toBe("linear");
  });

  it("throws on invalid save", async () => {
    await expect(
      savePreferences(tmp, { vcs: "nope", issues: "none", vibe: "fun" }),
    ).rejects.toMatchObject({ code: "FOREMAN_PREFS_INVALID" });
  });
});

describe("toolingHints", () => {
  it("maps gitlab → glab and merge request", () => {
    const hints = toolingHints(
      defaultPreferences({ vcs: "gitlab", issues: "none", vibe: "fun" }),
    );
    expect(hints.gitCli).toBe("glab");
    expect(hints.prNoun).toBe("merge request");
    expect(hints.suggestedMcps).toContain("gitlab");
  });

  it("suggests atlassian MCP for jira", () => {
    const hints = toolingHints(
      defaultPreferences({ vcs: "github", issues: "jira", vibe: "fun" }),
    );
    expect(hints.suggestedMcps).toContain("atlassian");
    expect(hints.branchPrefixHint).toMatch(/Jira/);
  });

  it("suggests linear MCP for linear issues", () => {
    const hints = toolingHints(
      defaultPreferences({ vcs: "github", issues: "linear", vibe: "boring" }),
    );
    expect(hints.suggestedMcps).toContain("linear");
  });
});

describe("questionnaireCopy", () => {
  it("returns fun copy by default", () => {
    const copy = questionnaireCopy("fun");
    expect(copy.title).toMatch(/Hard-hat|🚧/);
    expect(copy.questions).toHaveLength(4);
    expect(copy.questions[0].options.map((o) => o.id)).toEqual([...VCS_PLATFORMS]);
  });

  it("returns boring professional copy", () => {
    const copy = questionnaireCopy("boring");
    expect(copy.title).toBe("Foreman preferences");
    expect(copy.intro).not.toMatch(/🚧/);
  });
});

describe("resolvePackageManagerPreference", () => {
  it("prefers a single lockfile over soft python signals", () => {
    const r = resolvePackageManagerPreference({
      packageManagers: ["uv", "pip"],
      lockfiles: ["uv.lock"],
    });
    expect(r.preferredPackageManager).toBe("uv");
    expect(r.packageManagerAmbiguous).toBe(false);
  });

  it("flags multiple node lockfiles as ambiguous", () => {
    const r = resolvePackageManagerPreference({
      packageManagers: ["npm", "pnpm"],
      lockfiles: ["package-lock.json", "pnpm-lock.yaml"],
    });
    expect(r.packageManagerAmbiguous).toBe(true);
  });

  it("flags soft python conflicts without lockfile", () => {
    const r = resolvePackageManagerPreference({
      packageManagers: ["poetry", "uv"],
      lockfiles: [],
    });
    expect(r.packageManagerAmbiguous).toBe(true);
  });
});

describe("packageManagerOptionsForStack", () => {
  it("returns python PMs for python-only", () => {
    const opts = packageManagerOptionsForStack({ languages: ["python"], packageManagers: ["uv"] });
    expect(opts).toEqual(expect.arrayContaining(["pip", "uv", "poetry", "other"]));
    expect(opts).not.toContain("npm");
  });

  it("returns node PMs for javascript", () => {
    const opts = packageManagerOptionsForStack({
      languages: ["javascript", "typescript"],
      packageManagers: ["pnpm", "npm"],
    });
    expect(opts).toEqual(expect.arrayContaining(["npm", "pnpm", "yarn", "bun", "other"]));
    expect(opts).not.toContain("pip");
  });
});

describe("buildQuestionnaire", () => {
  it("auto-fills uv for python-fastapi and omits PM question", async () => {
    const q = await buildQuestionnaire(path.join(fixtures, "python-fastapi"), { vibe: "fun" });
    expect(q.defaults.packageManager).toBe("uv");
    expect(q.questions.find((x) => x.id === "packageManager")).toBeUndefined();
    expect(q.questions.map((x) => x.id)).toEqual(["vcs", "issues", "vibe"]);
    expect(q.ux.mode).toBe("ask-question");
    expect(q.context.languages).toContain("python");
  });

  it("asks filtered node PM question when lockfiles conflict", async () => {
    const q = await buildQuestionnaire(path.join(fixtures, "nextjs-legacy"), { vibe: "boring" });
    const pm = q.questions.find((x) => x.id === "packageManager");
    expect(pm).toBeTruthy();
    const ids = pm.options.map((o) => o.id);
    expect(ids).toEqual(expect.arrayContaining(["npm", "pnpm", "yarn", "bun", "other"]));
    expect(ids).not.toContain("pip");
    expect(q.defaults.packageManager).toBeUndefined();
  });

  it("skips PM for empty repo", async () => {
    const q = await buildQuestionnaire(path.join(fixtures, "empty-repo"));
    expect(q.defaults.packageManager).toBeNull();
    expect(q.questions.find((x) => x.id === "packageManager")).toBeUndefined();
  });
});

describe("git-remote helpers", () => {
  it("classifies forge URLs", () => {
    expect(classifyRemoteUrl("git@github.com:org/repo.git")).toBe("github");
    expect(classifyRemoteUrl("https://gitlab.com/org/repo.git")).toBe("gitlab");
    expect(classifyRemoteUrl("https://bitbucket.org/org/repo.git")).toBe("bitbucket");
    expect(classifyRemoteUrl(null)).toBeNull();
  });

  it("parses owner/repo", () => {
    expect(repoNameFromRemote("git@github.com:smartSenseSolutions/aws-auto-tagger.git")).toBe(
      "smartSenseSolutions/aws-auto-tagger",
    );
  });
});

describe("enrichWithExa", () => {
  it("returns used:false when EXA_API_KEY is unset", async () => {
    const prev = process.env.EXA_API_KEY;
    delete process.env.EXA_API_KEY;
    try {
      const r = await enrichWithExa({ repoName: "example/repo" });
      expect(r.used).toBe(false);
    } finally {
      if (prev !== undefined) process.env.EXA_API_KEY = prev;
    }
  });
});
