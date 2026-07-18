import { describe, it, expect } from "vitest";
import {
  rankIssues,
  rankLikelyFiles,
  detectCommitStyle,
  pickGitCli,
} from "./issues.js";

describe("pickGitCli", () => {
  it("maps gitlab to glab and github to gh", () => {
    expect(pickGitCli({ vcs: "gitlab" })).toBe("glab");
    expect(pickGitCli({ vcs: "github" })).toBe("gh");
  });
});

describe("rankIssues", () => {
  it("prefers good-first-issue and unassigned", () => {
    const ranked = rankIssues([
      {
        number: 1,
        title: "Hard refactor",
        labels: ["breaking"],
        assignees: 2,
        comments: 40,
        createdAt: "2024-01-01",
        url: "",
      },
      {
        number: 2,
        title: "Docs typo",
        labels: ["good first issue"],
        assignees: 0,
        comments: 1,
        createdAt: "2024-06-01",
        url: "",
      },
    ]);
    expect(ranked[0].number).toBe(2);
    expect(ranked[0].difficulty).toBe("easy");
    expect(ranked[0].goodFirst).toBe(true);
  });
});

describe("rankLikelyFiles", () => {
  it("scores path keyword overlaps", () => {
    const ranked = rankLikelyFiles("fix login button in auth form", [
      "src/auth/LoginForm.tsx",
      "README.md",
      "src/utils/math.ts",
    ]);
    expect(ranked[0].file).toContain("LoginForm");
  });
});

describe("detectCommitStyle", () => {
  it("detects conventional commits", () => {
    const style = detectCommitStyle([
      "feat: add button",
      "fix(api): handle null",
      "docs: update readme",
      "WIP stuff",
    ]);
    expect(style.style).toBe("conventional");
    expect(style.conventionalRatio).toBeGreaterThan(0.5);
  });

  it("detects freeform when mostly non-conventional", () => {
    const style = detectCommitStyle(["Update readme", "oops", "final final"]);
    expect(style.style).toBe("freeform");
  });
});
