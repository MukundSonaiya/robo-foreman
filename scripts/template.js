/**
 * Simple {{var}} template substitution (no logic — keep deterministic).
 */

/**
 * @param {string} template
 * @param {Record<string, string | number | boolean | null | undefined>} vars
 */
export function renderTemplate(template, vars) {
  return template.replace(/\{\{\s*([a-zA-Z0-9_.-]+)\s*\}\}/g, (_, key) => {
    const value = vars[key];
    if (value === undefined || value === null) return "";
    return String(value);
  });
}

/**
 * @param {string} filePath
 * @param {Record<string, string | number | boolean | null | undefined>} vars
 */
export async function renderTemplateFile(filePath, vars) {
  const fs = await import("node:fs/promises");
  const text = await fs.readFile(filePath, "utf8");
  return renderTemplate(text, vars);
}
