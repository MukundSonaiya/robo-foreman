/**
 * Audit existing Cursor / agent setup in a target repo.
 * Returns checklist-ready findings (no grades).
 */

import fs from "node:fs/promises";
import path from "node:path";

/**
 * @typedef {"ok" | "warn" | "missing"} FindingStatus
 * @typedef {{ status: FindingStatus, area: string, message: string, fixId?: string, impact?: number }} Finding
 */

async function exists(root, rel) {
  try {
    await fs.access(path.join(root, rel));
    return true;
  } catch {
    return false;
  }
}

async function readText(root, rel) {
  try {
    return await fs.readFile(path.join(root, rel), "utf8");
  } catch {
    return null;
  }
}

async function listFiles(dir) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const out = [];
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...(await listFiles(full)));
      else out.push(full);
    }
    return out;
  } catch {
    return [];
  }
}

function parseMdcFrontmatter(text) {
  if (!text.startsWith("---")) return { ok: false, reason: "missing YAML frontmatter" };
  const end = text.indexOf("---", 3);
  if (end === -1) return { ok: false, reason: "unclosed YAML frontmatter" };
  const fm = text.slice(3, end).trim();
  if (!fm) return { ok: false, reason: "empty frontmatter" };
  return { ok: true, frontmatter: fm, body: text.slice(end + 3).trim() };
}

const STALE_MS = 180 * 24 * 60 * 60 * 1000;

/**
 * @param {string} repoRoot
 * @returns {Promise<{ findings: Finding[], meta: Record<string, unknown> }>}
 */
export async function auditCursorSetup(repoRoot) {
  /** @type {Finding[]} */
  const findings = [];
  const meta = {
    hasLegacyCursorrules: false,
    mdcFiles: [],
    mcpPath: null,
    hooksPath: null,
    hasAgentsMd: false,
    hasCursorignore: false,
  };

  // Legacy .cursorrules
  const legacy = await exists(repoRoot, ".cursorrules");
  meta.hasLegacyCursorrules = legacy;
  if (legacy) {
    findings.push({
      status: "warn",
      area: "Legacy rules",
      message: "`.cursorrules` found — migrate to `.cursor/rules/*.mdc` with `/build` (content preserved)",
      fixId: "migrate-cursorrules",
      impact: 90,
    });
  }

  // .cursor/rules
  const rulesDir = path.join(repoRoot, ".cursor", "rules");
  const ruleFiles = (await listFiles(rulesDir)).filter((f) => /\.(mdc|md|markdown)$/i.test(f));
  const mdcFiles = ruleFiles.filter((f) => f.endsWith(".mdc"));
  meta.mdcFiles = mdcFiles.map((f) => path.relative(repoRoot, f));

  if (mdcFiles.length === 0 && !legacy) {
    findings.push({
      status: "missing",
      area: "Project rules",
      message: "No `.cursor/rules/*.mdc` files — agent has no project-specific guidance",
      fixId: "add-rules",
      impact: 95,
    });
  } else if (mdcFiles.length === 0 && legacy) {
    findings.push({
      status: "missing",
      area: "Project rules",
      message: "Only legacy `.cursorrules` present — no modern `.mdc` rules yet",
      fixId: "migrate-cursorrules",
      impact: 92,
    });
  } else {
    let invalid = 0;
    let stale = 0;
    const now = Date.now();
    for (const file of mdcFiles) {
      const text = await fs.readFile(file, "utf8");
      const parsed = parseMdcFrontmatter(text);
      if (!parsed.ok) invalid += 1;
      else if (!parsed.body || parsed.body.length < 20) invalid += 1;
      const stat = await fs.stat(file);
      if (now - stat.mtimeMs > STALE_MS) stale += 1;
    }
    if (invalid > 0) {
      findings.push({
        status: "warn",
        area: "Project rules",
        message: `${invalid}/${mdcFiles.length} rule file(s) have invalid/empty frontmatter or body`,
        fixId: "fix-rules",
        impact: 70,
      });
    } else if (stale > 0) {
      findings.push({
        status: "warn",
        area: "Project rules",
        message: `${mdcFiles.length} .mdc rule(s) present; ${stale} look stale (>180d since mtime) — review still accurate`,
        fixId: "refresh-rules",
        impact: 40,
      });
    } else {
      findings.push({
        status: "ok",
        area: "Project rules",
        message: `${mdcFiles.length} valid .mdc rule(s) in .cursor/rules/`,
        impact: 0,
      });
    }
  }

  // MCP
  const mcpCandidates = [".cursor/mcp.json", "mcp.json", ".mcp.json"];
  let mcpPath = null;
  for (const c of mcpCandidates) {
    if (await exists(repoRoot, c)) {
      mcpPath = c;
      break;
    }
  }
  meta.mcpPath = mcpPath;
  if (!mcpPath) {
    findings.push({
      status: "missing",
      area: "MCP",
      message: "No MCP config (`.cursor/mcp.json`) — stack-aware servers can be suggested by `/build`",
      fixId: "add-mcp",
      impact: 60,
    });
  } else {
    const text = await readText(repoRoot, mcpPath);
    try {
      const json = JSON.parse(text);
      const servers = json.mcpServers || json.servers || {};
      const names = Object.keys(servers);
      if (names.length === 0) {
        findings.push({
          status: "warn",
          area: "MCP",
          message: `\`${mcpPath}\` parses but defines zero servers`,
          fixId: "add-mcp",
          impact: 55,
        });
      } else {
        findings.push({
          status: "ok",
          area: "MCP",
          message: `\`${mcpPath}\` defines ${names.length} server(s): ${names.join(", ")}`,
          impact: 0,
        });
      }
    } catch {
      findings.push({
        status: "warn",
        area: "MCP",
        message: `\`${mcpPath}\` exists but is invalid JSON`,
        fixId: "fix-mcp",
        impact: 75,
      });
    }
  }

  // Hooks
  const hooksCandidates = [".cursor/hooks.json", "hooks/hooks.json"];
  let hooksPath = null;
  for (const c of hooksCandidates) {
    if (await exists(repoRoot, c)) {
      hooksPath = c;
      break;
    }
  }
  meta.hooksPath = hooksPath;
  if (!hooksPath) {
    findings.push({
      status: "missing",
      area: "Hooks",
      message: "No `.cursor/hooks.json` — formatter-after-edit and secret guards not configured",
      fixId: "add-hooks",
      impact: 80,
    });
  } else {
    const text = await readText(repoRoot, hooksPath);
    try {
      const json = JSON.parse(text);
      const hooks = json.hooks || {};
      const events = Object.keys(hooks);
      if (events.length === 0) {
        findings.push({
          status: "warn",
          area: "Hooks",
          message: `\`${hooksPath}\` parses but registers no events`,
          fixId: "add-hooks",
          impact: 65,
        });
      } else {
        findings.push({
          status: "ok",
          area: "Hooks",
          message: `\`${hooksPath}\` registers: ${events.join(", ")}`,
          impact: 0,
        });
      }
    } catch {
      findings.push({
        status: "warn",
        area: "Hooks",
        message: `\`${hooksPath}\` exists but is invalid JSON`,
        fixId: "fix-hooks",
        impact: 75,
      });
    }
  }

  // AGENTS.md
  const agentsMd = await readText(repoRoot, "AGENTS.md");
  meta.hasAgentsMd = agentsMd !== null;
  if (agentsMd === null) {
    findings.push({
      status: "missing",
      area: "AGENTS.md",
      message: "No `AGENTS.md` — agents lack a simple project playbook",
      fixId: "add-agents-md",
      impact: 85,
    });
  } else if (agentsMd.trim().length < 80) {
    findings.push({
      status: "warn",
      area: "AGENTS.md",
      message: "`AGENTS.md` exists but is too thin to be useful (add real commands + folder map)",
      fixId: "enrich-agents-md",
      impact: 70,
    });
  } else {
    findings.push({
      status: "ok",
      area: "AGENTS.md",
      message: "`AGENTS.md` present with substantive content",
      impact: 0,
    });
  }

  // .cursorignore
  const hasIgnore = await exists(repoRoot, ".cursorignore");
  meta.hasCursorignore = hasIgnore;
  if (!hasIgnore) {
    findings.push({
      status: "missing",
      area: ".cursorignore",
      message: "No `.cursorignore` — large/generated paths may flood agent context",
      fixId: "add-cursorignore",
      impact: 50,
    });
  } else {
    findings.push({
      status: "ok",
      area: ".cursorignore",
      message: "`.cursorignore` present",
      impact: 0,
    });
  }

  // docs/PLANS convention
  if (!(await exists(repoRoot, "docs/PLANS"))) {
    findings.push({
      status: "missing",
      area: "docs/PLANS",
      message: "No `docs/PLANS/` convention for spec-first issue plans",
      fixId: "add-plans-dir",
      impact: 35,
    });
  } else {
    findings.push({
      status: "ok",
      area: "docs/PLANS",
      message: "`docs/PLANS/` directory present",
      impact: 0,
    });
  }

  // no-slop rule
  const hasNoSlop = mdcFiles.some((f) => path.basename(f).toLowerCase().includes("no-slop"));
  if (!hasNoSlop) {
    findings.push({
      status: "missing",
      area: "no-slop rule",
      message: "No `no-slop.mdc` — agents may add drive-by comments/refactors",
      fixId: "add-no-slop",
      impact: 55,
    });
  } else {
    findings.push({
      status: "ok",
      area: "no-slop rule",
      message: "`no-slop` rule present",
      impact: 0,
    });
  }

  return { findings, meta };
}

/**
 * Build stack-related findings from detectStack output.
 * @param {import("./detect.js").StackDetection} stack
 * @param {{ packageManager?: string | null }} [prefs]
 * @returns {Finding[]}
 */
export function stackFindings(stack, prefs = {}) {
  /** @type {Finding[]} */
  const findings = [];

  if (stack.languages.length === 0 && stack.manifests.length === 0) {
    findings.push({
      status: "warn",
      area: "Stack",
      message: "No language manifest detected (package.json / pyproject / go.mod / Cargo.toml)",
      impact: 30,
    });
  } else {
    findings.push({
      status: "ok",
      area: "Languages",
      message: `Detected: ${stack.languages.join(", ") || "unknown"} · manifests: ${stack.manifests.join(", ") || "none"}`,
      impact: 0,
    });
  }

  if (stack.frameworks.length) {
    findings.push({
      status: "ok",
      area: "Frameworks",
      message: stack.frameworks.join(", "),
      impact: 0,
    });
  } else if (stack.languages.length) {
    findings.push({
      status: "warn",
      area: "Frameworks",
      message: "Language detected but no framework config matched — `/build` will use generic templates",
      fixId: "generic-template",
      impact: 25,
    });
  }

  if (stack.packageManagerAmbiguous) {
    const preferred = prefs.packageManager || stack.preferredPackageManager;
    findings.push({
      status: "warn",
      area: "Package manager",
      message: preferred
        ? `Multiple lockfiles (${stack.lockfiles.join(", ")}); using preference/detection \`${preferred}\``
        : `Multiple lockfiles (${stack.lockfiles.join(", ")}) — set packageManager in preferences`,
      fixId: "pin-package-manager",
      impact: 65,
    });
  } else if (stack.preferredPackageManager || prefs.packageManager) {
    findings.push({
      status: "ok",
      area: "Package manager",
      message: `Pinned to \`${prefs.packageManager || stack.preferredPackageManager}\``,
      impact: 0,
    });
  } else if (stack.languages.includes("javascript") || stack.languages.includes("typescript")) {
    findings.push({
      status: "missing",
      area: "Package manager",
      message: "Node project without lockfile — add one or set preference before `/build`",
      fixId: "pin-package-manager",
      impact: 60,
    });
  }

  if (stack.signals.packageJsonParseError) {
    findings.push({
      status: "warn",
      area: "package.json",
      message: "`package.json` exists but failed to parse",
      impact: 80,
    });
  }

  if (stack.signals.authDeps || stack.signals.apiRoutes) {
    findings.push({
      status: "warn",
      area: "Security surface",
      message: "Auth deps and/or API routes detected — consider running the `security-checker` subagent",
      fixId: "suggest-security-checker",
      impact: 45,
    });
  }

  return findings;
}

/**
 * Top N fixes by impact, excluding already-ok items.
 * @param {Finding[]} findings
 * @param {number} [n]
 */
export function topFixes(findings, n = 3) {
  return findings
    .filter((f) => f.status !== "ok" && f.fixId)
    .sort((a, b) => (b.impact ?? 0) - (a.impact ?? 0))
    .slice(0, n);
}
