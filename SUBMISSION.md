# SUBMISSION.md — Cursor Marketplace / cursor.directory

## Marketplace checklist

- [x] `.cursor-plugin/plugin.json` with valid kebab-case `name`: `robo-foreman`
- [x] `displayName`, `description`, `version`, `author`, `license`, `keywords`, `category`, `tags`
- [x] `logo` → `assets/logo.svg` (committed, relative path)
- [x] Skills with frontmatter (`name`, `description`) under `skills/*/SKILL.md`
- [x] Commands with frontmatter under `commands/`
- [x] Agents with frontmatter under `agents/`
- [x] Hooks config at `hooks/hooks.json`
- [x] README documents install + the three commands + preferences
- [x] All manifest paths relative (no `..`, no absolute paths)
- [x] Tested locally via `~/.cursor/plugins/local/robo-foreman`
- [x] Open source (MIT)
- [ ] Public GitHub repository URL
- [ ] Submit at https://cursor.com/marketplace/publish
- [ ] Manual review by Cursor team

## cursor.directory

- [ ] Add listing with name **Robo Foreman**, short blurb, repo URL, and tags: `cursor-plugin`, `oss`, `agentic`, `setup`
- [ ] Link demo GIF or screenshot of `.foreman/report.md` checklist (no grades)

## Local verify before submit

```bash
npm test
node scripts/cli.js scan --repo tests/fixtures/nextjs-legacy --no-write | head
ln -sf "$(pwd)" ~/.cursor/plugins/local/robo-foreman
# Reload Cursor → confirm /scan /build /contribute
```

## Single-plugin repo note

This repository **is** the plugin root (no `.cursor-plugin/marketplace.json`). That matches the official single-plugin guidance in Cursor docs / plugin-template.
