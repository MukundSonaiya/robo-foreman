import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { applyBuild } from "./apply-build.js";
import { savePreferences } from "./preferences.js";
import { findPollutionInStaged } from "./git-exclude.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, "..", "tests", "fixtures");

describe("applyBuild", () => {
  /** @type {string[]} */
  const tmps = [];

  afterEach(async () => {
    for (const t of tmps) await fs.rm(t, { recursive: true, force: true });
    tmps.length = 0;
  });

  it("dry-run returns plan without writing rules", async () => {
    const tmp = await fs.mkdtemp(path.join(process.cwd(), "tests", ".tmp-apply-"));
    tmps.push(tmp);
    await fs.cp(path.join(fixtures, "nextjs-legacy"), tmp, { recursive: true });
    await savePreferences(tmp, {
      vcs: "github",
      issues: "github-issues",
      packageManager: "pnpm",
      vibe: "fun",
    });
    const result = await applyBuild(tmp, { dryRun: true });
    expect(result.dryRun).toBe(true);
    expect(result.selected.length).toBeGreaterThan(3);
    await expect(fs.access(path.join(tmp, "AGENTS.md"))).rejects.toThrow();
  });
});

describe("ship pollution check", () => {
  it("flags foreman paths in staged lists", () => {
    expect(
      findPollutionInStaged(["src/x.ts", ".foreman/report.md", "docs/PLANS/issue-1.md"]),
    ).toContain(".foreman/report.md");
  });
});
