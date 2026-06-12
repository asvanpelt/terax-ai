import { presentableDiff } from "@codemirror/merge";

type WorkingComparison = {
  kind: "working";
  mode: "-" | "+";
};

type CommitComparison = {
  kind: "commit";
  chipLabel?: string;
};

export type GitDiffComparison = {
  badge: string;
  beforeLabel: string;
  afterLabel: string;
  description: string;
};

export function gitDiffComparison(
  source: WorkingComparison | CommitComparison,
): GitDiffComparison {
  if (source.kind === "commit") {
    return {
      badge: source.chipLabel ?? "Commit",
      beforeLabel: "Parent",
      afterLabel: source.chipLabel ?? "Commit",
      description: "Changes introduced by this commit",
    };
  }
  if (source.mode === "+") {
    return {
      badge: "Staged",
      beforeLabel: "HEAD",
      afterLabel: "Staged",
      description: "Changes ready to commit",
    };
  }
  return {
    badge: "Unstaged",
    beforeLabel: "Index",
    afterLabel: "Working tree",
    description: "Local changes not staged yet",
  };
}

export function computeDiffLineStats(
  original: string,
  modified: string,
): { added: number; removed: number } {
  const changes = presentableDiff(original, modified);
  let added = 0;
  let removed = 0;
  for (const change of changes) {
    removed += countLines(original, change.fromA, change.toA);
    added += countLines(modified, change.fromB, change.toB);
  }
  return { added, removed };
}

function countLines(doc: string, from: number, to: number): number {
  if (from === to) return 0;
  const slice = doc.slice(from, to);
  let count = 1;
  for (let i = 0; i < slice.length; i++) {
    if (slice.charCodeAt(i) === 10) count++;
  }
  if (slice.endsWith("\n")) count--;
  return Math.max(count, 1);
}
