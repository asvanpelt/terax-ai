import { describe, expect, it } from "vitest";
import { isLeaf, leafIds, type PaneNode, splitLeaf } from "./panes";

const leaf = (id: number): PaneNode => ({ kind: "leaf", id, cwd: "/repo" });

describe("splitLeaf with a view", () => {
  it("tags only the new leaf as git-status, leaving the terminal leaf plain", () => {
    const tree = splitLeaf(leaf(1), 1, 100, 2, "col", "/repo", "git-status");
    expect(tree.kind).toBe("split");
    if (tree.kind !== "split") return;
    const [first, second] = tree.children;
    // Original terminal leaf keeps no view (renders a PTY).
    expect(isLeaf(first) && first.view).toBeUndefined();
    // New leaf carries the git-status view (renders no PTY).
    expect(isLeaf(second) && second.view).toBe("git-status");
    expect(isLeaf(second) && second.cwd).toBe("/repo");
  });

  it("defaults to a terminal leaf (no view) when none is requested", () => {
    const tree = splitLeaf(leaf(1), 1, 100, 2, "row", "/repo");
    if (tree.kind !== "split") throw new Error("expected split");
    expect(tree.children.every((c) => isLeaf(c) && c.view === undefined)).toBe(
      true,
    );
    expect(leafIds(tree)).toEqual([1, 2]);
  });

  it("appends a git-status sibling inside an existing same-direction split", () => {
    const base = splitLeaf(leaf(1), 1, 100, 2, "col", "/repo");
    const grown = splitLeaf(base, 2, 101, 3, "col", "/repo", "git-status");
    if (grown.kind !== "split") throw new Error("expected split");
    expect(grown.children).toHaveLength(3);
    const last = grown.children[2];
    expect(isLeaf(last) && last.view).toBe("git-status");
  });
});
