/**
 * Plan files /build would write — agents confirm before applying.
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderTemplate } from "./template.js";
import { detectStack, pickTemplateId } from "./detect.js";
import { loadPreferences, toolingHints } from "./preferences.js";
import { migrateCursorrulesToMdc } from "./merge.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES = path.join(__dirname, "..", "templates");

const PM_INSTALL = {
  npm: "npm install",
  pnpm: "pnpm add",
  yarn: "yarn add",
  bun: "bun add",
  pip: "pip install",
  uv: "uv add",
  poetry: "poetry add",
  cargo: "cargo add",
  go: "go get",
};

const PM_FORMAT = {
  npm: "npx prettier --write . || true",
  pnpm: "pnpm exec prettier --write . || true",
  yarn: "yarn prettier --write . || true",
  bun: "bunx prettier --write . || true",
  pip: "echo 'no js formatter'",
  uv: "echo 'no js formatter'",
  poetry: "echo 'no js formatter'",
  cargo: "cargo fmt || true",
  go: "gofmt -w . || true",
};

/**
 * Suggest MCP servers from stack + preferences.
 */
export function suggestMcps(stack, prefs) {
  const hints = prefs ? toolingHints(prefs) : { suggestedMcps: [] };
  /** @type {Record<string, object>} */
  const servers = {};

  for (const name of hints.suggestedMcps || []) {
    if (name === "github") {
      servers.github = {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-github"],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: "${GITHUB_TOKEN}" },
      };
    }
    if (name === "gitlab") {
      servers.gitlab = {
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-gitlab"],
        env: { GITLAB_TOKEN: "${GITLAB_TOKEN}" },
      };
    }
    if (name === "atlassian") {
      servers.atlassian = {
        command: "npx",
        args: ["-y", "mcp-remote", "https://mcp.atlassian.com/v1/sse"],
      };
    }
    if (name === "linear") {
      servers.linear = {
        command: "npx",
        args: ["-y", "mcp-remote", "https://mcp.linear.app/sse"],
      };
    }
  }

  if (stack.frameworks.includes("prisma") || stack.frameworks.includes("drizzle")) {
    servers.postgres = {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-postgres"],
      env: { POSTGRES_CONNECTION_STRING: "${DATABASE_URL}" },
    };
  }
  if (
    stack.frameworks.includes("react") ||
    stack.frameworks.includes("nextjs") ||
    stack.frameworks.includes("vite")
  ) {
    servers.playwright = {
      command: "npx",
      args: ["-y", "@playwright/mcp@latest"],
    };
  }

  return servers;
}

function pickCommands(stack, pm) {
  const scripts = new Set(stack.scripts || []);
  const test =
    scripts.has("test")
      ? `${pm} test`
      : scripts.has("test:unit")
        ? `${pm} run test:unit`
        : stack.languages.includes("python")
          ? "pytest"
          : "echo 'no test script'";
  const lint =
    scripts.has("lint")
      ? `${pm} run lint`
      : stack.languages.includes("python")
        ? "ruff check . || true"
        : "echo 'no lint script'";
  const dev =
    scripts.has("dev")
      ? `${pm} run dev`
      : scripts.has("start")
        ? `${pm} start`
        : "echo 'no dev script'";
  return { test, lint, dev };
}

/**
 * Build a dry-run plan of files to write.
 * @param {string} repoRoot
 */
export async function planBuild(repoRoot) {
  const prefs = await loadPreferences(repoRoot);
  const stack = await detectStack(repoRoot);
  const templateId = pickTemplateId(stack);
  const pm =
    prefs?.packageManager || stack.preferredPackageManager || "npm";
  const { test, lint, dev } = pickCommands(stack, pm === "npm" ? "npm" : pm);

  const stackNotesPath = path.join(TEMPLATES, templateId, "stack-notes.md");
  let stackNotes = "Match local conventions.";
  try {
    stackNotes = await fs.readFile(stackNotesPath, "utf8");
  } catch {
    stackNotes = await fs.readFile(path.join(TEMPLATES, "generic", "stack-notes.md"), "utf8");
  }

  const vars = {
    stack_name: templateId,
    stack_id: templateId,
    package_manager: pm,
    install_command: PM_INSTALL[pm] || `${pm} install`,
    format_command: PM_FORMAT[pm] || "true",
    test_command: test,
    lint_command: lint,
    repo_name: path.basename(path.resolve(repoRoot)),
    stack_notes: stackNotes.trim(),
    commands_block: [
      `- Dev: \`${dev}\``,
      `- Test: \`${test}\``,
      `- Lint: \`${lint}\``,
      ...[...stack.scripts].slice(0, 12).map((s) => `- \` ${pm === "npm" ? "npm run" : pm} ${s}\``),
    ].join("\n"),
    folder_map: await inferFolderMap(repoRoot),
    conventions: "Follow existing code style; see .cursor/rules/.",
  };

  /** @type {{ path: string, action: string, content: string, executable?: boolean }[]} */
  const files = [];

  const readTmpl = async (rel) =>
    renderTemplate(await fs.readFile(path.join(TEMPLATES, "shared", rel), "utf8"), vars);

  files.push({
    path: `.cursor/rules/foreman-${templateId}.mdc`,
    action: "write",
    content: await readTmpl("stack-rules.mdc.tmpl"),
  });
  files.push({
    path: ".cursor/rules/no-slop.mdc",
    action: "write",
    content: await readTmpl("no-slop.mdc.tmpl"),
  });
  files.push({
    path: ".cursor/rules/foreman-dependencies.mdc",
    action: "write",
    content: await readTmpl("dependencies.mdc.tmpl"),
  });
  files.push({
    path: "AGENTS.md",
    action: "write",
    content: await readTmpl("AGENTS.md.tmpl"),
  });
  files.push({
    path: ".cursorignore",
    action: "write",
    content: await readTmpl("cursorignore.tmpl"),
  });

  // Legacy migration
  try {
    const legacy = await fs.readFile(path.join(repoRoot, ".cursorrules"), "utf8");
    files.push({
      path: ".cursor/rules/migrated-cursorrules.mdc",
      action: "write",
      content: migrateCursorrulesToMdc(legacy),
    });
    files.push({
      path: ".cursorrules",
      action: "delete-after-migrate",
      content: "",
    });
  } catch {
    /* no legacy */
  }

  files.push({
    path: ".cursor/hooks.json",
    action: "merge-hooks",
    content: await readTmpl("hooks.json.tmpl"),
  });
  files.push({
    path: ".cursor/hooks/foreman-format.sh",
    action: "write",
    content: await readTmpl("foreman-format.sh.tmpl"),
    executable: true,
  });
  files.push({
    path: ".cursor/hooks/foreman-secret-guard.sh",
    action: "write",
    content: await readTmpl("foreman-secret-guard.sh.tmpl"),
    executable: true,
  });
  files.push({
    path: ".cursor/hooks/foreman-pollution-guard.sh",
    action: "write",
    content: await readTmpl("foreman-pollution-guard.sh.tmpl"),
    executable: true,
  });

  const mcpServers = suggestMcps(stack, prefs);
  files.push({
    path: ".cursor/mcp.json",
    action: "merge-mcp",
    content: JSON.stringify({ mcpServers }, null, 2) + "\n",
  });

  files.push({
    path: "docs/PLANS/.gitkeep",
    action: "write",
    content: "",
  });

  return {
    templateId,
    packageManager: pm,
    prefs,
    stack,
    mcpServers,
    files,
    summary: {
      write: files.filter((f) => f.action === "write").length,
      merge: files.filter((f) => f.action.startsWith("merge")).length,
      migrate: files.filter((f) => f.action.includes("migrate") || f.action.includes("delete")).length,
    },
  };
}

async function inferFolderMap(repoRoot) {
  const candidates = ["src", "app", "apps", "packages", "lib", "components", "api", "tests", "test"];
  const lines = [];
  for (const c of candidates) {
    try {
      const st = await fs.stat(path.join(repoRoot, c));
      if (st.isDirectory()) lines.push(`- \`${c}/\` — present`);
    } catch {
      /* skip */
    }
  }
  return lines.length ? lines.join("\n") : "- (inspect repo root for layout)";
}
