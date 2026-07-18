/**
 * Deep-merge JSON configs (mcp.json, hooks.json) without clobbering.
 */

/**
 * Deep merge: arrays are replaced (not concatenated) unless opts.concatArrays.
 * Objects merge recursively; `patch` wins on scalar conflicts.
 * @param {unknown} base
 * @param {unknown} patch
 * @param {{ concatArrays?: boolean }} [opts]
 */
export function deepMerge(base, patch, opts = {}) {
  if (patch === undefined) return clone(base);
  if (base === undefined || base === null) return clone(patch);
  if (Array.isArray(patch)) {
    if (opts.concatArrays && Array.isArray(base)) {
      return [...base, ...patch];
    }
    return clone(patch);
  }
  if (!isPlainObject(patch) || !isPlainObject(base)) {
    return clone(patch);
  }
  /** @type {Record<string, unknown>} */
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] = deepMerge(base[key], value, opts);
  }
  return out;
}

function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function clone(v) {
  if (v === undefined) return undefined;
  return JSON.parse(JSON.stringify(v));
}

/**
 * Merge MCP server maps under mcpServers key.
 * @param {object} existing
 * @param {object} incoming
 */
export function mergeMcpConfig(existing, incoming) {
  const base = isPlainObject(existing) ? existing : {};
  const patch = isPlainObject(incoming) ? incoming : {};
  const merged = deepMerge(base, patch);
  if (!merged.mcpServers) merged.mcpServers = {};
  // Prefer explicit mcpServers merge even if incoming used alternate key
  if (patch.servers && !patch.mcpServers) {
    merged.mcpServers = deepMerge(merged.mcpServers || {}, patch.servers);
  }
  return merged;
}

/**
 * Merge hooks.json — union hook arrays per event, dedupe by command string.
 * @param {object} existing
 * @param {object} incoming
 */
export function mergeHooksConfig(existing, incoming) {
  const base = isPlainObject(existing) ? { ...existing } : { version: 1, hooks: {} };
  const patch = isPlainObject(incoming) ? incoming : {};
  const out = {
    version: patch.version ?? base.version ?? 1,
    hooks: { ...(base.hooks || {}) },
  };
  const incomingHooks = patch.hooks || {};
  for (const [event, handlers] of Object.entries(incomingHooks)) {
    const prev = Array.isArray(out.hooks[event]) ? out.hooks[event] : [];
    const next = Array.isArray(handlers) ? handlers : [];
    const seen = new Set(prev.map(handlerKey));
    const merged = [...prev];
    for (const h of next) {
      const key = handlerKey(h);
      if (!seen.has(key)) {
        seen.add(key);
        merged.push(h);
      }
    }
    out.hooks[event] = merged;
  }
  return out;
}

function handlerKey(h) {
  if (!h || typeof h !== "object") return String(h);
  return JSON.stringify({
    command: h.command,
    matcher: h.matcher,
    type: h.type,
    prompt: h.prompt,
  });
}

/**
 * Migrate legacy `.cursorrules` body into an `.mdc` document.
 * @param {string} body
 * @param {{ description?: string }} [opts]
 */
export function migrateCursorrulesToMdc(body, opts = {}) {
  const description = opts.description || "Migrated from legacy .cursorrules";
  const trimmed = (body || "").trim();
  return `---
description: ${description}
alwaysApply: true
---

${trimmed}
`;
}
