/**
 * Deterministic stack detection from repo files (lockfiles, manifests, configs).
 */

import fs from "node:fs/promises";
import path from "node:path";

const FILE_EXISTS = async (root, rel) => {
  try {
    await fs.access(path.join(root, rel));
    return true;
  } catch {
    return false;
  }
};

const readText = async (root, rel) => {
  try {
    return await fs.readFile(path.join(root, rel), "utf8");
  } catch {
    return null;
  }
};

const readJson = async (root, rel) => {
  const text = await readText(root, rel);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { __parseError: true, raw: text };
  }
};

const LOCKFILE_TO_PM = [
  { file: "pnpm-lock.yaml", pm: "pnpm" },
  { file: "yarn.lock", pm: "yarn" },
  { file: "bun.lockb", pm: "bun" },
  { file: "bun.lock", pm: "bun" },
  { file: "package-lock.json", pm: "npm" },
  { file: "uv.lock", pm: "uv" },
  { file: "poetry.lock", pm: "poetry" },
  { file: "Pipfile.lock", pm: "pipenv" },
  { file: "Cargo.lock", pm: "cargo" },
  { file: "go.sum", pm: "go" },
];

const FRAMEWORK_CONFIGS = [
  { file: "next.config.js", id: "nextjs" },
  { file: "next.config.mjs", id: "nextjs" },
  { file: "next.config.ts", id: "nextjs" },
  { file: "vite.config.js", id: "vite" },
  { file: "vite.config.ts", id: "vite" },
  { file: "vite.config.mjs", id: "vite" },
  { file: "astro.config.mjs", id: "astro" },
  { file: "nuxt.config.ts", id: "nuxt" },
  { file: "nuxt.config.js", id: "nuxt" },
  { file: "remix.config.js", id: "remix" },
  { file: "svelte.config.js", id: "sveltekit" },
  { file: "angular.json", id: "angular" },
  { file: "tailwind.config.js", id: "tailwind" },
  { file: "tailwind.config.ts", id: "tailwind" },
  { file: "prisma/schema.prisma", id: "prisma" },
  { file: "drizzle.config.ts", id: "drizzle" },
  { file: "manage.py", id: "django" },
];

/**
 * @typedef {object} StackDetection
 * @property {string[]} languages
 * @property {string[]} frameworks
 * @property {string[]} packageManagers
 * @property {string | null} preferredPackageManager
 * @property {boolean} packageManagerAmbiguous
 * @property {string[]} manifests
 * @property {string[]} lockfiles
 * @property {object | null} packageJson
 * @property {string[]} scripts
 * @property {Record<string, boolean>} signals
 */

/**
 * @param {string} repoRoot
 * @returns {Promise<StackDetection>}
 */
export async function detectStack(repoRoot) {
  const languages = new Set();
  const frameworks = new Set();
  const packageManagers = new Set();
  const manifests = [];
  const lockfiles = [];
  const signals = {};

  const pkg = await readJson(repoRoot, "package.json");
  if (pkg && !pkg.__parseError) {
    manifests.push("package.json");
    languages.add("javascript");
    signals.hasPackageJson = true;
    const deps = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies };
    const depNames = Object.keys(deps || {});
    if (depNames.includes("typescript") || (await FILE_EXISTS(repoRoot, "tsconfig.json"))) {
      languages.add("typescript");
    }
    if (depNames.some((d) => d === "next" || d.startsWith("next/"))) frameworks.add("nextjs");
    if (depNames.includes("react") || depNames.includes("react-dom")) frameworks.add("react");
    if (depNames.includes("vue")) frameworks.add("vue");
    if (depNames.includes("express")) frameworks.add("express");
    if (depNames.includes("fastify")) frameworks.add("fastify");
    if (depNames.includes("hono")) frameworks.add("hono");
    if (depNames.includes("@nestjs/core")) frameworks.add("nestjs");
    if (depNames.includes("vite")) frameworks.add("vite");
    if (depNames.includes("tailwindcss")) frameworks.add("tailwind");
    if (depNames.includes("prisma") || depNames.includes("@prisma/client")) frameworks.add("prisma");
    if (pkg.packageManager && typeof pkg.packageManager === "string") {
      const pm = pkg.packageManager.split("@")[0];
      packageManagers.add(pm);
      signals.packageManagerField = pm;
    }
  } else if (pkg?.__parseError) {
    signals.packageJsonParseError = true;
  }

  if (await FILE_EXISTS(repoRoot, "pyproject.toml")) {
    manifests.push("pyproject.toml");
    languages.add("python");
    const py = await readText(repoRoot, "pyproject.toml");
    if (py?.includes("fastapi")) frameworks.add("fastapi");
    if (py?.includes("django")) frameworks.add("django");
    if (py?.includes("flask")) frameworks.add("flask");
    if (py?.includes("[tool.poetry]")) packageManagers.add("poetry");
    if (py?.includes("[tool.uv]") || (await FILE_EXISTS(repoRoot, "uv.lock"))) {
      packageManagers.add("uv");
    }
  }
  if (await FILE_EXISTS(repoRoot, "requirements.txt")) {
    manifests.push("requirements.txt");
    languages.add("python");
    packageManagers.add("pip");
  }
  if (await FILE_EXISTS(repoRoot, "go.mod")) {
    manifests.push("go.mod");
    languages.add("go");
    packageManagers.add("go");
  }
  if (await FILE_EXISTS(repoRoot, "Cargo.toml")) {
    manifests.push("Cargo.toml");
    languages.add("rust");
    packageManagers.add("cargo");
  }

  for (const { file, pm } of LOCKFILE_TO_PM) {
    if (await FILE_EXISTS(repoRoot, file)) {
      lockfiles.push(file);
      packageManagers.add(pm);
    }
  }

  for (const { file, id } of FRAMEWORK_CONFIGS) {
    if (await FILE_EXISTS(repoRoot, file)) {
      frameworks.add(id);
      signals[`config:${file}`] = true;
    }
  }

  // Auth / API surface hints for security-checker suggestion
  if (pkg && !pkg.__parseError) {
    const all = JSON.stringify(pkg).toLowerCase();
    if (/(next-auth|auth0|clerk|passport|lucia|better-auth)/.test(all)) {
      signals.authDeps = true;
    }
  }
  if (await FILE_EXISTS(repoRoot, "app/api")) signals.apiRoutes = true;
  if (await FILE_EXISTS(repoRoot, "pages/api")) signals.apiRoutes = true;
  if (await FILE_EXISTS(repoRoot, "src/app/api")) signals.apiRoutes = true;

  const pmList = [...packageManagers];
  const resolved = resolvePackageManagerPreference({
    packageManagers: pmList,
    lockfiles,
    packageManagerField: signals.packageManagerField || null,
  });

  const scripts =
    pkg && !pkg.__parseError && pkg.scripts && typeof pkg.scripts === "object"
      ? Object.keys(pkg.scripts)
      : [];

  return {
    languages: [...languages].sort(),
    frameworks: [...frameworks].sort(),
    packageManagers: pmList.sort(),
    preferredPackageManager: resolved.preferredPackageManager,
    packageManagerAmbiguous: resolved.packageManagerAmbiguous,
    manifests,
    lockfiles,
    packageJson: pkg && !pkg.__parseError ? pkg : null,
    scripts,
    signals,
  };
}

export const NODE_PACKAGE_MANAGERS = Object.freeze(["npm", "pnpm", "yarn", "bun"]);
export const PYTHON_PACKAGE_MANAGERS = Object.freeze(["pip", "uv", "poetry", "pipenv"]);

/**
 * Prefer lockfile signals; treat multi-Node or multi-Python PMs as ambiguous.
 * @param {{ packageManagers: string[], lockfiles: string[], packageManagerField?: string | null }} input
 */
export function resolvePackageManagerPreference(input) {
  const pmList = [...new Set(input.packageManagers || [])];
  const lockfiles = input.lockfiles || [];
  const field = input.packageManagerField || null;

  const lockfilePms = [];
  for (const { file, pm } of LOCKFILE_TO_PM) {
    if (lockfiles.includes(file) && !lockfilePms.includes(pm)) lockfilePms.push(pm);
  }

  const nodePms = pmList.filter((p) => NODE_PACKAGE_MANAGERS.includes(p));
  const pythonPms = pmList.filter((p) => PYTHON_PACKAGE_MANAGERS.includes(p));
  const otherPms = pmList.filter(
    (p) => !NODE_PACKAGE_MANAGERS.includes(p) && !PYTHON_PACKAGE_MANAGERS.includes(p),
  );

  const ecosystemAmbiguous = nodePms.length > 1 || pythonPms.length > 1;
  let preferredPackageManager = null;

  if (lockfilePms.length === 1) {
    preferredPackageManager = lockfilePms[0];
  } else if (!ecosystemAmbiguous && pmList.length === 1) {
    preferredPackageManager = pmList[0];
  } else if (!ecosystemAmbiguous && nodePms.length === 1 && pythonPms.length === 0 && otherPms.length === 0) {
    preferredPackageManager = nodePms[0];
  } else if (!ecosystemAmbiguous && pythonPms.length === 1 && nodePms.length === 0 && otherPms.length === 0) {
    preferredPackageManager = pythonPms[0];
  } else if (!ecosystemAmbiguous && field && pmList.includes(field)) {
    preferredPackageManager = field;
  } else if (!ecosystemAmbiguous && otherPms.length === 1 && nodePms.length === 0 && pythonPms.length === 0) {
    preferredPackageManager = otherPms[0];
  }

  // Ambiguous when multiple lockfile PMs, or soft-signal conflicts with no lockfile winner
  const packageManagerAmbiguous =
    lockfilePms.length > 1 ||
    (lockfilePms.length === 0 && ecosystemAmbiguous) ||
    (lockfilePms.length === 0 && pmList.length > 1 && preferredPackageManager === null);

  return { preferredPackageManager, packageManagerAmbiguous, lockfilePms, nodePms, pythonPms };
}

/**
 * Pick a template id from detection results.
 * @param {StackDetection} stack
 */
export function pickTemplateId(stack) {
  if (stack.frameworks.includes("nextjs")) return "nextjs-react";
  if (stack.frameworks.includes("vite") && stack.frameworks.includes("react")) {
    return "vite-react";
  }
  if (stack.frameworks.includes("fastapi") || stack.frameworks.includes("django")) {
    return "python";
  }
  if (stack.languages.includes("python")) return "python";
  if (stack.frameworks.includes("express") || stack.frameworks.includes("fastify")) {
    return "node-express";
  }
  if (stack.languages.includes("javascript") || stack.languages.includes("typescript")) {
    return "node-express";
  }
  return "generic";
}
