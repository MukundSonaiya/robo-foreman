#!/usr/bin/env node
/**
 * Robo Foreman CLI — deterministic helpers for agent skills.
 *
 * Usage:
 *   node scripts/cli.js preferences questionnaire [--repo .]
 *   node scripts/cli.js preferences save --repo . --json '{"vcs":"github",...}'
 *   node scripts/cli.js scan [--repo .] [--write]
 *   node scripts/cli.js build-plan [--repo .]
 *   node scripts/cli.js exclude [--repo .] [--oss]
 */

import path from "node:path";
import { loadPreferences, savePreferences, needsQuestionnaire, questionnaireCopy, toolingHints } from "./preferences.js";
import { generateReport } from "./report.js";
import { planBuild } from "./build-plan.js";
import { ensureGitExclude } from "./git-exclude.js";
import { listBackups, restoreBackup } from "./backup.js";

function argValue(args, name, fallback) {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  return args[i + 1] ?? fallback;
}

function hasFlag(args, name) {
  return args.includes(name);
}

async function main() {
  const [, , cmd, sub, ...rest] = process.argv;
  const args = [sub, ...rest].filter(Boolean);
  const repo = path.resolve(argValue(args, "--repo", process.cwd()));

  if (cmd === "preferences" && sub === "questionnaire") {
    const prefs = await loadPreferences(repo);
    const force = hasFlag(args, "--force") || hasFlag(args, "--redo");
    const need = await needsQuestionnaire(repo, { force });
    const vibe = prefs?.vibe || "fun";
    console.log(
      JSON.stringify(
        {
          needsQuestionnaire: need,
          existing: prefs,
          copy: questionnaireCopy(vibe),
          tooling: prefs ? toolingHints(prefs) : null,
        },
        null,
        2,
      ),
    );
    return;
  }

  if (cmd === "preferences" && sub === "save") {
    const json = argValue(args, "--json", null);
    if (!json) {
      console.error("Missing --json");
      process.exit(1);
    }
    const saved = await savePreferences(repo, JSON.parse(json));
    console.log(JSON.stringify(saved, null, 2));
    return;
  }

  if (cmd === "scan") {
    const result = await generateReport(repo, { write: !hasFlag(args, "--no-write") });
    if (hasFlag(args, "--json")) {
      console.log(
        JSON.stringify(
          {
            reportFile: result.reportFile,
            templateId: result.templateId,
            topFixes: result.topFixes,
            findings: result.findings,
          },
          null,
          2,
        ),
      );
    } else {
      console.log(result.markdown);
    }
    return;
  }

  if (cmd === "build-plan") {
    const plan = await planBuild(repo);
    console.log(JSON.stringify(plan, null, 2));
    return;
  }

  if (cmd === "exclude") {
    const result = await ensureGitExclude(repo, { extraOss: hasFlag(args, "--oss") });
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (cmd === "backup" && sub === "list") {
    console.log(JSON.stringify(await listBackups(repo), null, 2));
    return;
  }

  if (cmd === "backup" && sub === "restore") {
    const backupId = argValue(args, "--id", undefined);
    console.log(JSON.stringify(await restoreBackup(repo, { backupId }), null, 2));
    return;
  }

  console.error(`Unknown command. Try: preferences | scan | build-plan | exclude | backup`);
  process.exit(1);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
