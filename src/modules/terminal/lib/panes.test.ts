import { describe, expect, it } from "vitest";
import {
  gitWorkspaceLayout,
  isLeaf,
  leafIds,
  type PaneNode,
  splitLeaf,
} from "./panes";

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

describe("gitWorkspaceLayout", () => {
  const ids = {
    rootSplit: 10,
    leftTerm: 11,
    rightSplit: 12,
    topLeaf: 13,
    bottomTerm: 14,
  };

  it("nests git-status over a terminal in the right column of a two-column row", () => {
    const tree = gitWorkspaceLayout(ids, "/repo");
    if (tree.kind !== "split") throw new Error("expected split");
    expect(tree.dir).toBe("row");
    expect(tree.children).toHaveLength(2);

    const [left, right] = tree.children;
    // Left column is a plain terminal leaf.
    expect(isLeaf(left) && left.view).toBeUndefined();
    // Right column stacks git-status on top of a terminal.
    if (right.kind !== "split") throw new Error("expected nested split");
    expect(right.dir).toBe("col");
    const [top, bottom] = right.children;
    expect(isLeaf(top) && top.view).toBe("git-status");
    expect(isLeaf(bottom) && bottom.view).toBeUndefined();
  });

  it("falls back to a plain terminal in the top-right pane when withGit is false", () => {
    const tree = gitWorkspaceLayout(ids, "/repo", false);
    if (tree.kind !== "split") throw new Error("expected split");
    const right = tree.children[1];
    if (right.kind !== "split") throw new Error("expected nested split");
    const [top, bottom] = right.children;
    // No git view anywhere: both right-column leaves render a PTY.
    expect(isLeaf(top) && top.view).toBeUndefined();
    expect(isLeaf(bottom) && bottom.view).toBeUndefined();
    expect(leafIds(tree)).toEqual([11, 13, 14]);
  });

  it("seeds every leaf with the given cwd and yields three unique leaves", () => {
    const tree = gitWorkspaceLayout(ids, "/repo");
    expect(leafIds(tree)).toEqual([11, 13, 14]);
    const cwds: string[] = [];
    const walk = (n: PaneNode) => {
      if (isLeaf(n)) {
        if (n.cwd) cwds.push(n.cwd);
        return;
      }
      n.children.forEach(walk);
    };
    walk(tree);
    expect(cwds).toEqual(["/repo", "/repo", "/repo"]);
  });
});
