import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectStack, pickTemplateId } from "./detect.js";
import { auditCursorSetup, stackFindings, topFixes } from "./audit.js";
import { generateReport, formatFindingLine, renderReportMarkdown } from "./report.js";
import { savePreferences } from "./preferences.js";
import fs from "node:fs/promises";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, "..", "tests", "fixtures");

describe("detectStack", () => {
  it("detects Next.js legacy fixture with ambiguous lockfiles", async () => {
    const stack = await detectStack(path.join(fixtures, "nextjs-legacy"));
    expect(stack.frameworks).toContain("nextjs");
    expect(stack.frameworks).toContain("react");
    expect(stack.frameworks).toContain("tailwind");
    expect(stack.packageManagerAmbiguous).toBe(true);
    expect(stack.lockfiles).toEqual(
      expect.arrayContaining(["pnpm-lock.yaml", "package-lock.json"]),
    );
    expect(stack.scripts).toContain("dev");
    expect(stack.signals.authDeps).toBe(true);
    expect(stack.signals.apiRoutes).toBe(true);
    expect(pickTemplateId(stack)).toBe("nextjs-react");
  });

  it("detects Python FastAPI + uv", async () => {
    const stack = await detectStack(path.join(fixtures, "python-fastapi"));
    expect(stack.languages).toContain("python");
    expect(stack.frameworks).toContain("fastapi");
    expect(stack.packageManagers).toContain("uv");
    expect(pickTemplateId(stack)).toBe("python");
  });

  it("handles empty repo", async () => {
    const stack = await detectStack(path.join(fixtures, "empty-repo"));
    expect(stack.languages).toEqual([]);
    expect(stack.manifests).toEqual([]);
    expect(pickTemplateId(stack)).toBe("generic");
  });

  it("detects vite react with packageManager field", async () => {
    const stack = await detectStack(path.join(fixtures, "valid-cursor"));
    expect(stack.frameworks).toContain("vite");
    expect(stack.frameworks).toContain("react");
    expect(stack.preferredPackageManager).toBe("pnpm");
    expect(stack.packageManagerAmbiguous).toBe(false);
    expect(pickTemplateId(stack)).toBe("vite-react");
  });
});

describe("auditCursorSetup", () => {
  it("flags legacy .cursorrules and missing modern setup", async () => {
    const { findings, meta } = await auditCursorSetup(path.join(fixtures, "nextjs-legacy"));
    expect(meta.hasLegacyCursorrules).toBe(true);
    const areas = findings.map((f) => f.area);
    expect(areas).toContain("Legacy rules");
    expect(findings.some((f) => f.status === "missing" && f.area === "Project rules")).toBe(true);
    expect(findings.some((f) => f.fixId === "migrate-cursorrules")).toBe(true);
  });

  it("reports ok findings for valid .cursor setup", async () => {
    const root = path.join(fixtures, "valid-cursor");
    // .cursorignore may be blocked from being committed in some environments — ensure at runtime
    await fs.writeFile(path.join(root, ".cursorignore"), "node_modules\ndist\n", "utf8").catch(() => {});
    const { findings, meta } = await auditCursorSetup(root);
    expect(meta.mdcFiles.length).toBeGreaterThanOrEqual(2);
    expect(meta.mcpPath).toBe(".cursor/mcp.json");
    expect(meta.hooksPath).toBe(".cursor/hooks.json");
    expect(meta.hasAgentsMd).toBe(true);
    expect(findings.some((f) => f.area === "Project rules" && f.status === "ok")).toBe(true);
    expect(findings.some((f) => f.area === "MCP" && f.status === "ok")).toBe(true);
    expect(findings.some((f) => f.area === "Hooks" && f.status === "ok")).toBe(true);
    expect(findings.some((f) => f.area === "no-slop rule" && f.status === "ok")).toBe(true);
  });

  it("ranks top fixes by impact", async () => {
    const { findings } = await auditCursorSetup(path.join(fixtures, "empty-repo"));
    const stack = await detectStack(path.join(fixtures, "empty-repo"));
    const all = [...stackFindings(stack), ...findings];
    const top = topFixes(all, 3);
    expect(top.length).toBeGreaterThan(0);
    expect(top.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < top.length; i++) {
      expect(top[i - 1].impact ?? 0).toBeGreaterThanOrEqual(top[i].impact ?? 0);
    }
  });
});

describe("generateReport", () => {
  it("writes checklist report without letter grades or scores", async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "foreman-report-"));
    // Copy nextjs-legacy into tmp so we can write .foreman
    const src = path.join(fixtures, "nextjs-legacy");
    await fs.cp(src, tmp, { recursive: true });
    await savePreferences(tmp, {
      vcs: "github",
      issues: "github-issues",
      packageManager: "pnpm",
      vibe: "fun",
    });

    const result = await generateReport(tmp, { repoName: "demo-next" });
    expect(result.markdown).toMatch(/Site Survey/);
    expect(result.markdown).toMatch(/✅|⚠️|❌/);
    expect(result.markdown).toMatch(/Highest-impact fixes/);
    expect(result.markdown).not.toMatch(/\/100/);
    expect(result.markdown).not.toMatch(/\b[A-F][+-]?\b grade/i);
    expect(result.markdown).not.toMatch(/Bronze|Silver|Gold|Platinum/);
    expect(result.templateId).toBe("nextjs-react");

    const onDisk = await fs.readFile(result.reportFile, "utf8");
    expect(onDisk).toBe(result.markdown);

    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("renders boring copy without construction emojis in title vibe", () => {
    const md = renderReportMarkdown({
      repoName: "acme",
      prefs: {
        version: 1,
        vcs: "gitlab",
        issues: "jira",
        packageManager: "npm",
        vibe: "boring",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
      stack: {
        languages: ["javascript"],
        frameworks: [],
        packageManagers: ["npm"],
        preferredPackageManager: "npm",
        packageManagerAmbiguous: false,
        manifests: ["package.json"],
        lockfiles: ["package-lock.json"],
        packageJson: {},
        scripts: ["test"],
        signals: {},
      },
      findings: [
        { status: "ok", area: "Languages", message: "javascript", impact: 0 },
        {
          status: "missing",
          area: "Project rules",
          message: "No rules",
          fixId: "add-rules",
          impact: 95,
        },
      ],
      templateId: "generic",
      generatedAt: "2026-07-18T00:00:00.000Z",
    });
    expect(md.startsWith("# Site Survey")).toBe(true);
    expect(md).not.toMatch(/🚧/);
    expect(md).toMatch(/No rules/);
    expect(
      formatFindingLine({
        status: "missing",
        area: "Project rules",
        message: "No rules",
      }),
    ).toBe("❌ Project rules — No rules");
  });
});
