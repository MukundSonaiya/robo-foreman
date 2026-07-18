import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  deepMerge,
  mergeMcpConfig,
  mergeHooksConfig,
  migrateCursorrulesToMdc,
} from "./merge.js";
import { createBackup, listBackups, restoreBackup, DEFAULT_BACKUP_PATHS } from "./backup.js";
import {
  ensureGitExclude,
  isPollutionPath,
  findPollutionInStaged,
  FOREMAN_EXCLUDE_MARKER_START,
  excludeFilePath,
} from "./git-exclude.js";

describe("deepMerge / mcp / hooks", () => {
  it("deep-merges nested objects without clobbering siblings", () => {
    const merged = deepMerge(
      { a: 1, nested: { x: 1, y: 2 } },
      { nested: { y: 9, z: 3 }, b: 2 },
    );
    expect(merged).toEqual({ a: 1, b: 2, nested: { x: 1, y: 9, z: 3 } });
  });

  it("merges mcpServers preserving existing servers", () => {
    const merged = mergeMcpConfig(
      { mcpServers: { postgres: { command: "npx" } } },
      { mcpServers: { playwright: { command: "npx" } } },
    );
    expect(Object.keys(merged.mcpServers).sort()).toEqual(["playwright", "postgres"]);
  });

  it("unions hook handlers and dedupes by command", () => {
    const merged = mergeHooksConfig(
      {
        version: 1,
        hooks: {
          afterFileEdit: [{ command: ".cursor/hooks/format.sh" }],
        },
      },
      {
        hooks: {
          afterFileEdit: [
            { command: ".cursor/hooks/format.sh" },
            { command: ".cursor/hooks/foreman-secrets.sh" },
          ],
          beforeShellExecution: [{ command: ".cursor/hooks/foreman-guard.sh", matcher: "git commit" }],
        },
      },
    );
    expect(merged.hooks.afterFileEdit).toHaveLength(2);
    expect(merged.hooks.beforeShellExecution).toHaveLength(1);
  });

  it("migrates .cursorrules body into mdc with frontmatter", () => {
    const mdc = migrateCursorrulesToMdc("Always use TypeScript.");
    expect(mdc).toMatch(/^---\n/);
    expect(mdc).toContain("alwaysApply: true");
    expect(mdc).toContain("Always use TypeScript.");
  });
});

describe("backup / undo", () => {
  /** @type {string} */
  let tmp;

  beforeEach(async () => {
    // Use workspace-local tmp so we can create .cursor paths when the OS allows;
    // fall back to root-level mcp.json if .cursor mkdir is blocked (sandbox).
    tmp = await fs.mkdtemp(path.join(process.cwd(), "tests", ".tmp-"));
    await fs.writeFile(path.join(tmp, "AGENTS.md"), "# old\n", "utf8");
    await fs.writeFile(path.join(tmp, ".cursorrules"), "legacy\n", "utf8");
    try {
      await fs.mkdir(path.join(tmp, ".cursor", "rules"), { recursive: true });
      await fs.writeFile(
        path.join(tmp, ".cursor", "mcp.json"),
        JSON.stringify({ mcpServers: { old: {} } }),
        "utf8",
      );
    } catch {
      await fs.writeFile(
        path.join(tmp, "mcp.json"),
        JSON.stringify({ mcpServers: { old: {} } }),
        "utf8",
      );
    }
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("snapshots files and restores after mutation", async () => {
    const snap = await createBackup(tmp, DEFAULT_BACKUP_PATHS, { label: "pre-build" });
    expect(snap.saved).toEqual(expect.arrayContaining(["AGENTS.md", ".cursorrules"]));
    expect((await listBackups(tmp))[0]).toBe(snap.backupId);

    await fs.writeFile(path.join(tmp, "AGENTS.md"), "# mutated by build\n", "utf8");
    const mcpRel = snap.saved.includes(".cursor/mcp.json")
      ? ".cursor/mcp.json"
      : "mcp.json";
    await fs.writeFile(
      path.join(tmp, mcpRel),
      JSON.stringify({ mcpServers: { new: {} } }),
      "utf8",
    );

    const result = await restoreBackup(tmp);
    expect(result.backupId).toBe(snap.backupId);
    expect(await fs.readFile(path.join(tmp, "AGENTS.md"), "utf8")).toBe("# old\n");
    const mcp = JSON.parse(await fs.readFile(path.join(tmp, mcpRel), "utf8"));
    expect(mcp.mcpServers.old).toBeDefined();
  });

  it("throws when no backups exist", async () => {
    const empty = await fs.mkdtemp(path.join(process.cwd(), "tests", ".tmp-empty-"));
    await expect(restoreBackup(empty)).rejects.toMatchObject({ code: "FOREMAN_NO_BACKUP" });
    await fs.rm(empty, { recursive: true, force: true });
  });
});

describe("git exclude / pollution", () => {
  /** @type {string} */
  let tmp;

  beforeEach(async () => {
    tmp = await fs.mkdtemp(path.join(os.tmpdir(), "foreman-ex-"));
    await fs.mkdir(path.join(tmp, ".git", "info"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("writes marked block into .git/info/exclude", async () => {
    const result = await ensureGitExclude(tmp);
    expect(result.action).toBe("created");
    const text = await fs.readFile(excludeFilePath(tmp), "utf8");
    expect(text).toContain(FOREMAN_EXCLUDE_MARKER_START);
    expect(text).toContain(".foreman/");
  });

  it("updates existing foreman block idempotently", async () => {
    await ensureGitExclude(tmp);
    const again = await ensureGitExclude(tmp, { extraOss: true });
    expect(again.action).toBe("updated");
    const text = await fs.readFile(excludeFilePath(tmp), "utf8");
    expect(text).toContain("docs/PLANS/issue-*.md");
    expect(text.split(FOREMAN_EXCLUDE_MARKER_START).length - 1).toBe(1);
  });

  it("detects pollution paths in staged file lists", () => {
    expect(isPollutionPath(".foreman/report.md")).toBe(true);
    expect(isPollutionPath("src/index.ts")).toBe(false);
    expect(
      findPollutionInStaged([
        "src/ok.ts",
        ".foreman/preferences.json",
        "README.md",
      ]),
    ).toEqual([".foreman/preferences.json"]);
  });
});
