# Cursor Plugin Format — Research Notes (Robo Foreman)

> Researched July 2026 against live Cursor docs and official open-source plugins.
> Sources: [cursor.com/docs/plugins](https://cursor.com/docs/plugins), [Plugins reference](https://cursor.com/docs/reference/plugins), [Rules](https://cursor.com/docs/context/rules), [Skills](https://cursor.com/docs/skills), [Hooks](https://cursor.com/docs/agent/hooks), [cursor/plugins](https://github.com/cursor/plugins), [cursor/plugin-template](https://github.com/cursor/plugin-template).

---

## 1. What a plugin is

A Cursor plugin is a **Git-hosted directory** that bundles any mix of:

| Component | Purpose | Default discovery path |
|-----------|---------|------------------------|
| **Rules** | Persistent AI guidance (`.mdc`) | `rules/` |
| **Skills** | Domain workflows the agent can invoke (`SKILL.md`) | `skills/<name>/SKILL.md` |
| **Agents** | Custom subagent prompts | `agents/*.md` |
| **Commands** | Slash-invokable agent actions | `commands/*.(md\|mdc\|txt)` |
| **Hooks** | Event-driven scripts (stdio JSON) | `hooks/hooks.json` |
| **MCP servers** | Tool integrations | `mcp.json` |

Plugins install at **user** or **project** scope from the Marketplace, a Team Marketplace, or locally via `~/.cursor/plugins/local/`.

---

## 2. Manifest: `.cursor-plugin/plugin.json`

**Required:** `name` only (lowercase kebab-case, alphanumerics / hyphens / periods, must start & end alphanumeric).

**Recommended fields** (from official plugins + JSON schema):

```json
{
  "name": "robo-foreman",
  "displayName": "Robo Foreman",
  "version": "0.1.0",
  "description": "Turn any project into an agentic-first workspace and contribute to open-source repos.",
  "author": { "name": "…", "email": "…" },
  "homepage": "https://github.com/…/robo-foreman",
  "repository": "https://github.com/…/robo-foreman",
  "license": "MIT",
  "logo": "assets/logo.svg",
  "keywords": ["agentic", "oss", "setup", "scan", "contribute"],
  "category": "developer-tools",
  "tags": ["rules", "skills", "hooks", "oss"]
}
```

Optional path overrides: `rules`, `skills`, `agents`, `commands`, `hooks`, `mcpServers`.  
If omitted, folder-based discovery applies. **If a path field is set, it replaces (does not merge with) default discovery for that component.**

Schema: `https://cursor.com/schemas/cursor-plugin/plugin.json` (also in `cursor/plugins/schemas/plugin.schema.json`).

### Single-plugin vs multi-plugin repo

| Style | Layout | When to use |
|-------|--------|-------------|
| **Single plugin** | Repo root = plugin root; one `.cursor-plugin/plugin.json`; **no** `marketplace.json` | One product (Robo Foreman) |
| **Multi-plugin marketplace** | Root `.cursor-plugin/marketplace.json` + each plugin in its own folder with its own manifest | Official `cursor/plugins`, template starters |

**Robo Foreman decision:** single-plugin repository at repo root (simpler submit, clearer branding).

---

## 3. Component formats (schemas that matter)

### 3.1 Rules (`.mdc`)

YAML frontmatter + markdown body. Project rules live in `.cursor/rules/` when written into a target repo; plugin-bundled rules live in the plugin's `rules/`.

| Field | Behavior |
|-------|----------|
| `alwaysApply: true` | Always in context |
| `alwaysApply: false` + `globs` | Auto-attach when matching files are in context |
| `alwaysApply: false` + `description` (no globs) | Agent decides based on description |
| `alwaysApply: false`, no description/globs | Manual `@`-mention only |

```markdown
---
description: Prefer const over let
alwaysApply: true
---

prefer-const: Always use `const`…
```

**Legacy:** plain `.cursorrules` still appears in the wild; migrate content → `.cursor/rules/*.mdc` (preserve body). Plain `.md` in `.cursor/rules/` is **ignored** (no frontmatter). Prefer `AGENTS.md` for simple free-form project instructions.

### 3.2 Skills (`skills/<name>/SKILL.md`)

```yaml
---
name: scan          # must match folder name; kebab-case
description: …     # agent uses this for relevance
paths: "**/*.ts"    # optional file scoping
disable-model-invocation: true  # slash-only; no auto-apply
---
```

Optional skill subdirs: `scripts/`, `references/`, `assets/` (progressive loading).

**Pattern from official plugins:** orchestration skills (`disable-model-invocation: true`) that delegate to focused **agents** / subagents — see `continual-learning`, `agent-compatibility`, `create-plugin`.

### 3.3 Commands (`commands/*.md`)

Slash commands with the same frontmatter shape as skills (`name`, `description`). Template `starter-advanced` ships `commands/deploy-staging.md`. Skills with `disable-model-invocation: true` behave similarly; **team-kit prefers skills over commands** for rich workflows.

**Robo Foreman decision:** ship **both** thin `commands/{scan,build,contribute}.md` entrypoints **and** matching skills that hold the full workflow (commands point agents at the skill + scripts). Keeps `/scan` discoverable and skills reusable.

### 3.4 Agents / subagents (`agents/*.md`)

```yaml
---
name: inspector
description: Runs parallel site-survey checks for Robo Foreman /scan
model: inherit   # optional; seen in continual-learning
---
```

Used as Task/subagent targets. Official pattern: parent skill launches one agent per concern in parallel (`agent-compatibility` launches four review agents).

### 3.5 Hooks (`hooks/hooks.json`)

```json
{
  "version": 1,
  "hooks": {
    "afterFileEdit": [{ "command": "./scripts/format.sh" }],
    "beforeShellExecution": [
      { "command": "./scripts/guard.sh", "matcher": "git commit|git add" }
    ]
  }
}
```

**Agent events (current):**  
`sessionStart`, `sessionEnd`, `preToolUse`, `postToolUse`, `postToolUseFailure`, `subagentStart`, `subagentStop`, `beforeShellExecution`, `afterShellExecution`, `beforeMCPExecution`, `afterMCPExecution`, `beforeReadFile`, `afterFileEdit`, `beforeSubmitPrompt`, `preCompact`, `stop`, `afterAgentResponse`, `afterAgentThought`

**Tab:** `beforeTabFileRead`, `afterTabFileEdit`  
**App:** `workspaceOpen` (can return extra plugin paths)

Hooks are **stdio JSON** processes. Exit `0` = OK; exit `2` = block; other = fail-open.

**Plugin paths:** official hooks use `${CURSOR_PLUGIN_ROOT}` so scripts resolve inside the installed plugin, e.g.:

```json
{ "command": "bun run ${CURSOR_PLUGIN_ROOT}/hooks/continual-learning-stop.ts" }
```

**Project hooks** (written into a user's repo) live at `.cursor/hooks.json` with paths relative to **project root** (e.g. `.cursor/hooks/format.sh`).

**Robo Foreman hook plan (only supported events):**
- Plugin or project `afterFileEdit` → stack formatter
- `beforeShellExecution` matcher on commit/add → block staging of `.foreman/` / foreman-generated pollution paths
- Optional `beforeReadFile` / secret-file guard patterns

Do **not** invent unsupported events (no mythical `preCommit` — use shell matcher on `git commit`).

### 3.6 MCP (`mcp.json`)

```json
{
  "mcpServers": {
    "postgres": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres"],
      "env": { "POSTGRES_CONNECTION_STRING": "${POSTGRES_URL}" }
    }
  }
}
```

`/build` should **merge** into the project's existing MCP config (never clobber). Plugin-level `mcp.json` is optional for Robo Foreman (we *suggest* MCPs based on stack + prefs rather than hard-bundling secrets-dependent servers).

---

## 4. Local install & marketplace submission

### Local testing

Cursor **rejects** local plugins whose path is a symlink pointing outside `~/.cursor/plugins/local` (pluginsSubsystem warning: `symlink target … is outside …/local`). Copy the plugin tree in instead of symlinking:

```bash
# From the robo-foreman checkout:
npm run install:cursor
# Restart Cursor or Developer: Reload Window
```

Or manually (same idea as the script):

```bash
mkdir -p ~/.cursor/plugins/local
rm -rf ~/.cursor/plugins/local/robo-foreman
rsync -a --exclude '.git' --exclude 'tests' --exclude 'docs' \
  /path/to/robo-foreman/ ~/.cursor/plugins/local/robo-foreman/
```

Confirm rules/skills/commands appear under **Customize**. Official create-plugin skill still documents `~/.cursor/plugins/local/` as the install target — use a real directory there, not an external symlink.

### Submission

1. Public Git repo with valid `.cursor-plugin/plugin.json`
2. Submit at [cursor.com/marketplace/publish](https://cursor.com/marketplace/publish)
3. Manual review; must be open source
4. Community discovery also via [cursor.directory](https://cursor.directory)

Checklist (from docs + create-plugin skill):
- Valid kebab-case `name`
- Frontmatter on all rules/skills/agents/commands
- Relative paths only (no `..`, no absolute)
- Logo committed + relative `logo` field
- README with install + usage
- Tested locally

---

## 5. Official plugins studied (patterns to copy)

### 5.1 `cursor/plugin-template` — `starter-advanced`

Full surface area demo:

```
starter-advanced/
├── .cursor-plugin/plugin.json
├── agents/security-reviewer.md
├── commands/deploy-staging.md
├── hooks/hooks.json
├── mcp.json
├── rules/*.mdc
├── scripts/{format,validate,audit}.sh
├── skills/code-reviewer/SKILL.md
└── assets/logo.svg
```

Takeaway: keep scripts next to hooks; thin command files; alwaysApply rules for baseline.

### 5.2 `continual-learning` (cursor/plugins)

- Skill with `disable-model-invocation: true` orchestrates one dedicated agent
- Hook on `stop` uses `${CURSOR_PLUGIN_ROOT}` + Bun TypeScript
- Clear guardrails (“parent skill orchestration-only”)

### 5.3 `create-plugin` (cursor/plugins)

- Skills: scaffold + submission review
- Always-apply quality-gates rule
- Agent: `plugin-architect`
- Documents `~/.cursor/plugins/local/` as default install target

### 5.4 `agent-compatibility` (closest analog to `/scan`)

- Skill launches **parallel subagents** (scan / startup / validation / docs)
- Deterministic CLI + agent judgment
- **Outputs a numeric score** — we deliberately diverge (see §7)

### 5.5 `cursor-team-kit`

- Many focused skills (`deslop`, `review-and-ship`, `new-branch-and-pr`)
- Agents for CI watching / harsh review
- `deslop` ≈ inspiration for our `no-slop.mdc` rule content
- Shipping skill uses `gh` and insists on focused commits / no hook bypass

---

## 6. Architecture implications for Robo Foreman

```
robo-foreman/                          # single-plugin repo root
├── .cursor-plugin/plugin.json
├── assets/logo.svg
├── commands/
│   ├── scan.md
│   ├── build.md
│   └── contribute.md
├── skills/
│   ├── scan/SKILL.md
│   ├── build/SKILL.md
│   └── contribute/SKILL.md
├── agents/
│   ├── inspector.md
│   ├── security-checker.md
│   └── reviewer.md
├── hooks/
│   └── hooks.json                     # plugin-level defaults if any
├── scripts/                           # deterministic Node helpers (vitest)
│   ├── preferences.js
│   ├── detect.js
│   ├── audit.js
│   ├── report.js
│   ├── merge-json.js
│   ├── backup.js
│   ├── git-exclude.js
│   └── … 
├── templates/                         # stack templates + variable substitution
├── docs/
│   ├── cursor-plugin-format.md        # this file
│   └── PLANS/                         # convention we teach target repos
├── package.json                       # scripts package for helpers + tests
└── README.md
```

**Division of labor**
- **Agents / skills:** judgment (questionnaire phrasing, ranking issues, writing rules from exemplars, PR narrative)
- **Scripts:** plumbing (lockfile detection, JSON deep-merge, backup/undo, `.git/info/exclude`, gh/glab wrappers, preference I/O)

**Target-repo artifacts** (written by `/build`, never committed in OSS mode):
- `.foreman/preferences.json`, `.foreman/report.md`, `.foreman/backup/<ts>/`
- `.cursor/rules/*.mdc`, `.cursor/hooks.json`, `AGENTS.md`, `.cursorignore`, `docs/PLANS/`
- Pollution protection: `.git/info/exclude` + beforeShellExecution guard + ship-phase staged-file check

---

## 7. `/scan` report format — detailed design (no grades)

`agent-compatibility` uses `N/100` scores. **Robo Foreman must not.** Judges and contributors want an honest checklist, not a vanity score.

### 7.1 Preference gate (first run)

Before scanning, if `.foreman/preferences.json` is missing, run a **context-aware** questionnaire (AskQuestion pickers — not freeform slash replies):

1. Version control platform — `github` | `gitlab` | `bitbucket` | `other` (prompt includes git remote hint when detected)
2. Issue management — `github-issues` | `jira` | `linear` | `trello` | `none`
3. Package manager — **only if ambiguous**; options filtered to the detected stack (Python → pip/uv/poetry; Node → npm/pnpm/yarn/bun). Clear single lockfile → auto-fill, skip question.
4. Vibe — `fun` (default, hard-hat emojis) | `boring` (professional copy)

Optional: when `EXA_API_KEY` is set, soft-enrich VCS/issue suggestions via Exa. Local detect always wins for package manager.

Persist to `.foreman/preferences.json` (gitignored / exclude-listed). Later runs: load prefs; offer “redo questionnaire” as a scan option.

Preferences drive downstream MCP suggestions and CLI choice (`gh` vs `glab`, Linear vs Jira, branch naming).

### 7.2 Detection dimensions (script-backed)

| Dimension | Signals |
|-----------|---------|
| **Stack** | `package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Gemfile`, `pom.xml`, `build.gradle*` |
| **Lockfiles / PM** | `pnpm-lock.yaml`, `yarn.lock`, `package-lock.json`, `bun.lockb`, `uv.lock`, `poetry.lock`, `Cargo.lock` |
| **Frameworks** | `next.config.*`, `vite.config.*`, `astro.config.*`, `nuxt.config.*`, `django`/`fastapi` imports, Prisma, Tailwind, etc. |
| **Cursor setup** | `.cursorrules`, `.cursor/rules/**`, `AGENTS.md`, `.cursor/mcp.json` / `mcp.json`, `.cursor/hooks.json`, `.cursor/agents/`, `.cursorignore`, `.agents/skills/` |
| **Validity / staleness** | Parse `.mdc` frontmatter; flag empty rules; flag rules older than 180d mtime if never updated; broken JSON in hooks/mcp |
| **Repo hygiene** | README, CONTRIBUTING, PR/issue templates, CI configs (informational for contribute later) |

### 7.3 Checklist item schema

Each finding is one line:

```text
STATUS  AREA — one plain sentence
```

`STATUS` ∈ { `✅`, `⚠️`, `❌` } meaning **in good shape / needs attention / missing**.

No letter grades, no tiers (Bronze/Silver), no `/100` scores, no RAG traffic-light summary beyond the per-item statuses.

### 7.4 Report markdown shape (saved to `.foreman/report.md`)

```markdown
# 🚧 Site Survey — <repo-name>
> Generated by Robo Foreman `/scan` · <ISO timestamp>
> Vibe: fun | Preferences: github + github-issues + pnpm

## Preferences
- VCS: GitHub · Issues: GitHub Issues · PM: pnpm · Copy: fun
- Redo questionnaire: re-run `/scan` and choose “redo prefs”

## Stack
- ✅ Runtime — Node 20+ detected via `package.json` engines
- ✅ Framework — Next.js 15 (`next.config.ts`)
- ⚠️ Package manager — both `pnpm-lock.yaml` and `package-lock.json` present; using preference `pnpm`

## Cursor agent setup
- ❌ Project rules — no `.cursor/rules/*.mdc` (legacy `.cursorrules` found — migrate with `/build`)
- ⚠️ MCP — `.cursor/mcp.json` parses but lists a server with missing env vars
- ❌ Hooks — no `.cursor/hooks.json`
- ⚠️ AGENTS.md — present but empty of real commands
- ✅ .cursorignore — present

## Highest-impact fixes (top 3)
1. Migrate `.cursorrules` → `.cursor/rules/` and add `no-slop.mdc`
2. Add formatter `afterFileEdit` hook for the detected stack
3. Write `AGENTS.md` with real `package.json` scripts and a folder map

👉 Run `/build` to apply these (non-destructive; backup + confirm first).
```

`--boring` / `vibe: boring` swaps emoji headers and casual lines for plain professional copy, same structure.

### 7.5 Parallelism

`/scan` skill should launch the **`inspector`** subagent (and optionally parallel inspector tasks) for stack vs Cursor-setup vs hygiene, then merge into one checklist — same orchestration pattern as `agent-compatibility`, without the score.

---

## 8. `/build` & `/contribute` — format constraints (preview)

- **Merge, never clobber** `mcp.json` / `hooks.json` (deep-merge scripts).
- **Snapshot** to `.foreman/backup/<timestamp>/` before writes; undo = restore latest backup (offered inside `/build`).
- **Confirm** full file list before writing.
- **OSS no-pollution:** write excludes to `.git/info/exclude` (not `.gitignore`); ship phase refuses to stage `.foreman/**`, generated rules if user doesn't own the repo, etc.
- **Hooks written to the project** must use events listed in §3.5 only.
- **Contribute** phases reuse prefs for `gh`/`glab`/Linear/Jira; draft PR/MR by default.

---

## 9. Open questions (ask before big deviations)

1. Bundle optional MCP stubs in plugin `mcp.json`, or only suggest merges into the project? *(lean: suggest-only)*
2. Node scripts: plain ESM in `scripts/` with vitest, or a small `packages/foreman-cli`? *(lean: flat `scripts/` + root `package.json` for hackathon speed)*
3. Commands vs skills-only for `/scan` `/build` `/contribute`? *(lean: both — thin commands + rich skills)*

---

## 10. References

- https://cursor.com/docs/plugins
- https://cursor.com/docs/reference/plugins
- https://cursor.com/docs/context/rules
- https://cursor.com/docs/skills
- https://cursor.com/docs/agent/hooks
- https://github.com/cursor/plugins
- https://github.com/cursor/plugin-template
- https://cursor.com/marketplace/publish
