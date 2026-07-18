import { describe, it, expect } from "vitest";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderTemplate } from "./template.js";
import { planBuild, suggestMcps } from "./build-plan.js";
import { savePreferences } from "./preferences.js";
import fs from "node:fs/promises";
import os from "node:os";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(__dirname, "..", "tests", "fixtures");

describe("renderTemplate", () => {
  it("substitutes {{vars}}", () => {
    expect(renderTemplate("hi {{name}}!", { name: "foreman" })).toBe("hi foreman!");
    expect(renderTemplate("x={{missing}}", {})).toBe("x=");
  });
});

describe("planBuild", () => {
  it("plans nextjs rules and mcp suggestions for legacy fixture", async () => {
    const tmp = await fs.mkdtemp(path.join(process.cwd(), "tests", ".tmp-plan-"));
    await fs.cp(path.join(fixtures, "nextjs-legacy"), tmp, { recursive: true });
    await savePreferences(tmp, {
      vcs: "github",
      issues: "linear",
      packageManager: "pnpm",
      vibe: "fun",
    });
    const plan = await planBuild(tmp);
    expect(plan.templateId).toBe("nextjs-react");
    expect(plan.files.some((f) => f.path.endsWith("no-slop.mdc"))).toBe(true);
    expect(plan.files.some((f) => f.path.includes("migrated-cursorrules"))).toBe(true);
    expect(plan.mcpServers.linear).toBeDefined();
    expect(plan.mcpServers.playwright).toBeDefined();
    await fs.rm(tmp, { recursive: true, force: true });
  });

  it("suggests atlassian for jira prefs", () => {
    const servers = suggestMcps(
      { frameworks: [], languages: [], scripts: [], signals: {} },
      {
        version: 1,
        vcs: "github",
        issues: "jira",
        packageManager: null,
        vibe: "boring",
        createdAt: "",
        updatedAt: "",
      },
    );
    expect(servers.atlassian).toBeDefined();
  });
});
