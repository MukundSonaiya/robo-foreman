---
name: build
description: Non-destructive install and repair from a Robo Foreman scan — rules, hooks, MCP merge, AGENTS.md, backup, confirm, and undo.
disable-model-invocation: true
---

# Robo Foreman — `/build` (install & repair)

You are the foreman applying fixes. Blueprints first, then construction. 🔨

## Scripts

```bash
node ${CURSOR_PLUGIN_ROOT}/scripts/cli.js build-plan --repo <repo>
node ${CURSOR_PLUGIN_ROOT}/scripts/cli.js exclude --repo <repo>
node ${CURSOR_PLUGIN_ROOT}/scripts/cli.js backup list --repo <repo>
node ${CURSOR_PLUGIN_ROOT}/scripts/cli.js backup restore --repo <repo>
```

Use Node helpers in `scripts/backup.js`, `scripts/merge.js` when applying merges programmatically.

## Workflow

### 0. Undo path (offer first)

If the user asks to **undo**, run `backup restore` (latest) and stop.

### 1. Load plan

1. Prefer latest `.foreman/report.md` + `build-plan` JSON.
2. Present a **multi-select** of fixes; pre-check the top 3 from the scan.
3. Also offer: migrate `.cursorrules`, add hooks, merge MCP suggestions, write AGENTS.md, `.cursorignore`, `docs/PLANS/`.

### 2. Confirm

Show the **full file list** (paths + action: write | merge-mcp | merge-hooks | migrate). Wait for explicit confirmation before writing.

### 3. Safety sequence

1. `createBackup` for `DEFAULT_BACKUP_PATHS` (via scripts).
2. `ensureGitExclude` so `.foreman/` never lands in commits.
3. Apply selected files:
   - **merge-mcp** / **merge-hooks** using `mergeMcpConfig` / `mergeHooksConfig` (never clobber).
   - **write** new rules / AGENTS.md / hooks scripts / `.cursorignore`.
   - **migrate** `.cursorrules` → `.cursor/rules/migrated-cursorrules.mdc`, then remove or leave legacy only after user OK.
4. chmod +x hook scripts.
5. Summarize what changed + remind how to undo.

### 4. Stack + preference MCP mapping

Suggest (and merge if selected) MCP servers for:

- DB (Prisma/Drizzle) → postgres MCP
- Frontend → Playwright MCP
- Jira → Atlassian
- Linear → Linear
- GitLab → GitLab
- GitHub → GitHub

### 5. Project skills (judgment)

When useful, mine 1–2 exemplar files from the repo and add a short project skill under `.cursor/skills/` describing “how we do X here” (migrations, components, etc.). Keep it thin and point at real paths.

## Guardrails

- Never overwrite MCP/hooks blindly — merge only.
- Always backup first.
- Always confirm the file list.
- Do not commit `.foreman/` or force `.gitignore` pollution patterns (exclude file only).
- Tone follows saved vibe.
