import { describe, expect, it } from "vitest";
import { computeDiffLineStats, gitDiffComparison } from "./gitDiffPresentation";

describe("gitDiffComparison", () => {
  it("explains unstaged comparisons", () => {
    expect(gitDiffComparison({ kind: "working", mode: "-" })).toEqual({
      badge: "Unstaged",
      beforeLabel: "Index",
      afterLabel: "Working tree",
      description: "Local changes not staged yet",
    });
  });

  it("explains staged comparisons", () => {
    expect(gitDiffComparison({ kind: "working", mode: "+" })).toEqual({
      badge: "Staged",
      beforeLabel: "HEAD",
      afterLabel: "Staged",
      description: "Changes ready to commit",
    });
  });
});

describe("computeDiffLineStats", () => {
  it("counts replaced, added, and removed lines", () => {
    expect(
      computeDiffLineStats(
        "keep\nreplace\nremove\n",
        "keep\nreplacement\nadd one\nadd two\n",
      ),
    ).toEqual({ added: 3, removed: 2 });
  });

  it("returns zero for identical content", () => {
    expect(computeDiffLineStats("same\n", "same\n")).toEqual({
      added: 0,
      removed: 0,
    });
  });
});
