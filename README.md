# Robo Foreman 🚧

**Cursor plugin** that turns any project into an agentic-first workspace and helps you contribute to open-source repos.

Persona: a friendly site foreman directing your agent crew — hard hats, blueprints, site surveys. Original branding only. Gen Z energy by default; pass boring prefs (`vibe: boring`) for plain professional copy.

## What you get

Exactly **three** commands:

| Command | Job |
|---------|-----|
| `/scan` | Site survey (read-only) — prefs questionnaire, stack detection, Cursor setup audit, **checklist report** (no letter grades) |
| `/build` | Install & repair — multi-select fixes, backup, merge (never clobber), undo |
| `/contribute` | Full OSS wizard — onboard → pick issue → solve → ship **draft** PR/MR |

## Install

### Local (hackathon / testing)

Cursor loads local plugins from `~/.cursor/plugins/local/`. **Do not symlink** from outside that folder — Cursor rejects external symlink targets (`symlink target … is outside …/plugins/local`). Use the install script, which copies the plugin in:

```bash
git clone <this-repo> ~/src/robo-foreman
cd ~/src/robo-foreman
npm install && npm test
npm run install:cursor
```

Reload Cursor (**Developer: Reload Window**). Confirm `/scan`, `/build`, `/contribute` under Agent `/` menu and Customize → Plugins.

After you change this checkout, re-run `npm run install:cursor` so the copy under `~/.cursor/plugins/local/robo-foreman` stays in sync.

### Marketplace

When listed: install **Robo Foreman** from the Cursor Marketplace (Customize → Plugins) or browse [cursor.directory](https://cursor.directory). See `SUBMISSION.md`.

## Preference system

First `/scan` runs a **context-aware** questionnaire (Cursor **AskQuestion** pickers — not freeform “github / npm / fun” replies):

1. VCS — GitHub / GitLab / Bitbucket / other (prompt includes git remote hint when detected)  
2. Issues — GitHub Issues / Jira / Linear / Trello / none  
3. Package manager — **only if lockfiles conflict**; options filtered to the stack (e.g. Python → pip / uv / poetry)  
4. Vibe — fun or boring  

Saved to `.foreman/preferences.json` (local only — git-ignored / exclude-listed). Say **redo** on a later scan to re-run. Prefs drive `gh` vs `glab`, MCP suggestions (Atlassian / Linear / GitLab), and copy tone.

Optional web hints: set `EXA_API_KEY` in your environment before `/scan` to soft-enrich VCS/issue suggestions via [Exa](https://exa.ai). Local lockfile/manifest detection always wins for package manager.

## Architecture

- **Skills / agents** — judgment (questionnaire, ranking, writing rules from exemplars, PR narrative)
- **`scripts/`** — deterministic Node helpers (detect, audit, report, merge, backup, git-exclude, issues, CLI)
- **`templates/`** — stack templates with `{{var}}` substitution

```bash
node scripts/cli.js scan --repo /path/to/project
node scripts/cli.js build-plan --repo /path/to/project
node scripts/cli.js build-apply --repo /path/to/project --dry-run
```

## No-pollution rule (OSS)

Foreman must never leak agent config into someone else's PR:

1. `.git/info/exclude` markers (not `.gitignore`)
2. `beforeShellExecution` pollution guard hook
3. Ship-phase staged-file check

## Demo

See [`DEMO.md`](./DEMO.md) for a 3-minute judge script.

## License

MIT
