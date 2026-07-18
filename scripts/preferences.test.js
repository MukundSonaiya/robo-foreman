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
  defaultPreferences,
  VCS_PLATFORMS,
} from "./preferences.js";
import { preferencesPath } from "./lib/paths.js";

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
    expect(copy.questions[0].options).toEqual([...VCS_PLATFORMS]);
  });

  it("returns boring professional copy", () => {
    const copy = questionnaireCopy("boring");
    expect(copy.title).toBe("Foreman preferences");
    expect(copy.intro).not.toMatch(/🚧/);
  });
});
