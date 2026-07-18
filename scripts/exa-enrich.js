/**
 * Optional Exa enrichment for preference questionnaire hints.
 * Gated on EXA_API_KEY — never required; failures are soft.
 */

/**
 * @typedef {object} ExaEnrichment
 * @property {boolean} used
 * @property {string} [error]
 * @property {string | null} [suggestedVcs]
 * @property {string | null} [suggestedIssues]
 * @property {string[]} [urls]
 * @property {string} [summary]
 */

/**
 * @param {{ remoteUrl?: string | null, repoName?: string | null }} opts
 * @returns {Promise<ExaEnrichment>}
 */
export async function enrichWithExa(opts = {}) {
  const apiKey = process.env.EXA_API_KEY?.trim();
  if (!apiKey) {
    return { used: false };
  }

  const remoteUrl = opts.remoteUrl || null;
  const repoName = opts.repoName || null;
  const queryParts = [
    "open source repository issue tracker github gitlab jira linear",
    remoteUrl,
    repoName,
  ].filter(Boolean);
  const query = queryParts.join(" ");

  try {
    const res = await fetch("https://api.exa.ai/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify({
        query,
        type: "fast",
        numResults: 5,
        contents: { highlights: true },
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return {
        used: true,
        error: `Exa HTTP ${res.status}`,
        suggestedVcs: null,
        suggestedIssues: null,
        urls: [],
      };
    }

    const data = await res.json();
    const results = Array.isArray(data?.results) ? data.results : [];
    const urls = results.map((r) => r.url).filter(Boolean);
    const blob = results
      .map((r) => [r.title, r.url, ...(r.highlights || [])].filter(Boolean).join(" "))
      .join("\n")
      .toLowerCase();

    let suggestedVcs = null;
    if (/github\.com/.test(blob) || /\bgithub\b/.test(blob)) suggestedVcs = "github";
    else if (/gitlab\.com/.test(blob) || /\bgitlab\b/.test(blob)) suggestedVcs = "gitlab";
    else if (/bitbucket\.org/.test(blob) || /\bbitbucket\b/.test(blob)) suggestedVcs = "bitbucket";

    let suggestedIssues = null;
    if (/\blinear\.app\b/.test(blob) || /\blinear\b/.test(blob)) suggestedIssues = "linear";
    else if (/\batlassian\.net\b/.test(blob) || /\bjira\b/.test(blob)) suggestedIssues = "jira";
    else if (/\btrello\.com\b/.test(blob) || /\btrello\b/.test(blob)) suggestedIssues = "trello";
    else if (suggestedVcs === "github" || /github\.com\/[^/\s]+\/[^/\s]+\/issues/.test(blob)) {
      suggestedIssues = "github-issues";
    }

    return {
      used: true,
      suggestedVcs,
      suggestedIssues,
      urls: urls.slice(0, 5),
      summary: results[0]?.title || undefined,
    };
  } catch (err) {
    return {
      used: true,
      error: err instanceof Error ? err.message : String(err),
      suggestedVcs: null,
      suggestedIssues: null,
      urls: [],
    };
  }
}
