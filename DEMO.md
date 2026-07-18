# DEMO.md — 3-minute hackathon script

**Goal:** Show Robo Foreman turning a messy repo into an agentic workspace, then starting an OSS contribution — without polluting the PR.

## Prep (before judges arrive)

1. Local plugin linked:

   ```bash
   ln -sf "$(pwd)" ~/.cursor/plugins/local/robo-foreman
   ```

2. Reload Cursor window.
3. Open fixture (or copy) **`tests/fixtures/nextjs-legacy`** as the workspace for acts 1–2.
4. Have **`tests/fixtures/oss-mock`** ready for act 3 (or any small public good-first-issue repo).

---

## Minute 0:00–0:40 — `/scan` site survey

1. Open chat → run **`/scan`**.
2. Complete the hard-hat questionnaire (GitHub + GitHub Issues + pnpm + fun).
3. **What judges see:**
   - Detailed checklist with ✅ / ⚠️ / ❌ (legacy `.cursorrules`, missing rules/hooks/AGENTS.md, ambiguous lockfiles, auth/API nudge)
   - **No letter grades / no /100 score**
   - Top 3 fixes + “run `/build`”
   - File written: `.foreman/report.md` (open it in the editor for the screenshot)

Optional one-liner in terminal:

```bash
node scripts/cli.js scan --repo tests/fixtures/nextjs-legacy
```

---

## Minute 0:40–1:40 — `/build` repair

1. Run **`/build`**.
2. Show multi-select with top fixes pre-checked.
3. Confirm the **full file list** (rules, no-slop, MCP merge suggestions, hooks, AGENTS.md).
4. Apply → mention backup under `.foreman/backup/<timestamp>/`.
5. **What judges see:**
   - `.cursor/rules/*.mdc` including migrated cursorrules + `no-slop.mdc`
   - Merged hooks (formatter + secret + pollution guards)
   - `AGENTS.md` with real `package.json` scripts
   - Offer **undo** from latest backup (say it; don’t need to revert live)

---

## Minute 1:40–2:40 — `/contribute` wizard

1. Switch workspace to **`tests/fixtures/oss-mock`** (or a real good-first-issue repo).
2. Run **`/contribute`**.
3. Walk **Onboard** → show CONTRIBUTING.md + commit style detection.
4. Jump to **Pick** → ranked issues (or narrate with mock if offline).
5. Emphasize **no-pollution**: `.git/info/exclude` + ship check — “a PR with someone’s agent config is an instant close.”

---

## Minute 2:40–3:00 — close

- Recap three commands only: scan → build → contribute  
- Point at research doc `docs/cursor-plugin-format.md` + git history (incremental conventional commits)  
- Tagline: *Foreman directs the crew; scripts do the plumbing.*

## Fallback if Agent UI flakes

Run CLI demos and open `.foreman/report.md` + planned JSON:

```bash
node scripts/cli.js preferences save --repo /tmp/demo --json '{"vcs":"github","issues":"github-issues","packageManager":"pnpm","vibe":"fun"}'
cp -R tests/fixtures/nextjs-legacy /tmp/demo-next && node scripts/cli.js scan --repo /tmp/demo-next
node scripts/cli.js build-plan --repo /tmp/demo-next | head -80
```
