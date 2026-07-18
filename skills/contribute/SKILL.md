---
name: contribute
description: Full OSS contribution wizard in one command — onboard, pick issue, solve, ship draft PR/MR with no-pollution guards.
disable-model-invocation: true
---

# Robo Foreman — `/contribute` (OSS crew)

One wizard. Four phases. Enter wherever you already are. 🏗️

## Scripts

```bash
node ${CURSOR_PLUGIN_ROOT}/scripts/cli.js preferences questionnaire --repo <repo>
node ${CURSOR_PLUGIN_ROOT}/scripts/cli.js exclude --repo <repo> --oss
node ${CURSOR_PLUGIN_ROOT}/scripts/cli.js scan --repo <repo> --json
```

Issue helpers live in `scripts/issues.js` (`listGoodFirstIssues`, `rankIssues`, `rankLikelyFiles`, `detectCommitStyle`).

## Detect current phase

| Signal | Start at |
|--------|----------|
| No prefs / fresh clone URL only | **Onboard** |
| Prefs + CONTRIBUTING digested, no issue chosen | **Pick** |
| `docs/PLANS/issue-N.md` exists or branch `*issue*N*` | **Solve** |
| Implementation done / user says ship | **Ship** |

---

## Phase 1 — Onboard

1. Load preferences (questionnaire if missing). Honor `gh` vs `glab`, Jira/Linear.
2. If given a repo URL, clone (or open existing checkout).
3. Read `CONTRIBUTING.md`, PR/MR templates, issue templates.
4. Sample `git log --oneline -30` → `detectCommitStyle`.
5. Verify install/dev/test commands from package manifests **actually run** (or note failures honestly).
6. Write contributor context into `.foreman/contribute-context.md` (exclude-listed):
   - Match their style exactly
   - Minimal diffs
   - Follow their commit conventions
7. Run `exclude --oss` so Foreman files never enter the diff via `.git/info/exclude`.

## Phase 2 — Pick an issue

1. List issues via preferred platform (`gh` / `glab`; MCP for Jira/Linear; REST + env token fallback).
2. Filter: good-first-issue / help-wanted / unassigned when possible.
3. Rank with difficulty estimate (labels, comments, keyword→file hits).
4. Show a ranked list; let the user pick.

## Phase 3 — Solve

1. Fetch issue + comments → `docs/PLANS/issue-<n>.md` (spec-first).
2. Locate likely files (`rankLikelyFiles` + repo search).
3. Create a branch matching repo convention (from CONTRIBUTING or recent branches; Jira/Linear prefixes from prefs).
4. Implement with strict definition of done:
   - Tests pass
   - Lint clean
   - Minimal diff
   - No drive-by refactors
5. Before finishing, run **`reviewer`** subagent on the diff vs repo conventions.

## Phase 4 — Ship

Pre-flight:

1. Tests + lint pass
2. Diff only touches issue-related files
3. **NO foreman-generated paths staged** (`.foreman/**`, etc.) — use `findPollutionInStaged`
4. Pollution guard hook + `.git/info/exclude` already applied

Then:

1. Fork workflow if no push access
2. Fill the repo's own PR/MR template (`fixes #<n>`, paste test output)
3. Open as **draft** by default (`gh pr create --draft` / `glab mr create --draft`)
4. Never stage Foreman pollution

## Guardrails

- Triple no-pollution: exclude file + pollution-guard hook + ship staged-file check
- Draft PRs/MRs by default
- Tone follows vibe prefs
- Suggest **`security-checker`** if touching auth/API routes
