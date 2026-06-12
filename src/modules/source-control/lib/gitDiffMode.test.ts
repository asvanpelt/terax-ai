import { describe, expect, it } from "vitest";
import { workingDiffMode } from "./gitDiffMode";

describe("workingDiffMode", () => {
  it("opens worktree changes as unstaged diffs", () => {
    expect(workingDiffMode({ unstaged: true })).toBe("-");
  });

  it("opens index-only changes as staged diffs", () => {
    expect(workingDiffMode({ unstaged: false })).toBe("+");
  });
});
