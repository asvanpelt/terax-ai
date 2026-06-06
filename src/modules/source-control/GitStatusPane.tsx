import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { native, type GitChangedFile } from "@/modules/ai/lib/native";
import { joinPath } from "@/modules/explorer/lib/useFileTree";
import {
  Cancel01Icon,
  CheckmarkCircle01Icon,
  FileEditIcon,
  FolderGitTwoIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Suspense, lazy, memo, useCallback, useEffect, useState } from "react";
import { useSourceControl } from "./useSourceControl";

// CodeMirror-heavy; load only when a diff is actually opened so it never
// reaches the terminal-eager bundle.
const GitDiffPane = lazy(() =>
  import("@/modules/editor/GitDiffPane").then((m) => ({
    default: m.GitDiffPane,
  })),
);

type Props = {
  cwd: string | undefined;
  enabled?: boolean;
  onOpenFile?: (absolutePath: string) => void;
  onClose?: () => void;
};

type Stat = { added: number; removed: number; isBinary: boolean };
type StageState = "checked" | "indeterminate" | "unchecked";

function stageState(f: GitChangedFile): StageState {
  if (f.staged && !f.unstaged && !f.untracked) return "checked";
  if (f.staged) return "indeterminate";
  return "unchecked";
}

function checkboxValue(s: StageState): boolean | "indeterminate" {
  if (s === "checked") return true;
  if (s === "indeterminate") return "indeterminate";
  return false;
}

function statusAccent(code: string): string {
  switch (code) {
    case "A":
      return "bg-emerald-500/85";
    case "M":
      return "bg-amber-500/85";
    case "D":
      return "bg-rose-500/85";
    case "R":
      return "bg-sky-500/85";
    case "?":
      return "bg-muted-foreground/50";
    default:
      return "bg-muted-foreground/40";
  }
}

function shortCode(f: GitChangedFile): string {
  if (f.untracked) return "?";
  const code = (f.worktreeStatus || f.indexStatus || "").trim();
  return code ? code[0].toUpperCase() : "M";
}

/**
 * A live `git status` view sized for a terminal split pane: fs-watcher driven
 * (no PTY), per-file stage checkboxes, an "Add all" button, a proportional
 * change bar per file, and a click-to-open diff dialog.
 */
export const GitStatusPane = memo(function GitStatusPane({
  cwd,
  enabled = true,
  onOpenFile,
  onClose,
}: Props) {
  const sc = useSourceControl(cwd ?? null, enabled);
  const repoRoot = sc.repo?.repoRoot ?? sc.status?.repoRoot ?? null;
  const files = sc.status?.changedFiles ?? [];
  const [busy, setBusy] = useState<string | null>(null);
  const [stats, setStats] = useState<Map<string, Stat>>(new Map());
  const [diffFile, setDiffFile] = useState<GitChangedFile | null>(null);

  // Change bars: one tiny `git diff --numstat` per refresh while visible.
  const statusKey = sc.status?.changedFiles.map((f) => f.path).join("\0") ?? "";
  useEffect(() => {
    if (!enabled || !repoRoot || !statusKey) {
      setStats(new Map());
      return;
    }
    let cancelled = false;
    native
      .gitDiffNumstat(repoRoot)
      .then((entries) => {
        if (cancelled) return;
        const m = new Map<string, Stat>();
        for (const e of entries) {
          m.set(e.path, {
            added: e.added,
            removed: e.removed,
            isBinary: e.isBinary,
          });
        }
        setStats(m);
      })
      .catch(() => {
        if (!cancelled) setStats(new Map());
      });
    return () => {
      cancelled = true;
    };
    // statusKey re-fetches when the changed-file set changes.
  }, [enabled, repoRoot, statusKey]);

  const run = useCallback(
    (key: string, op: Promise<void>) => {
      setBusy(key);
      op
        .then(() => sc.refresh())
        .catch(() => {
          // The next watcher-driven refresh re-syncs the real state.
        })
        .finally(() => setBusy(null));
    },
    [sc],
  );

  const toggleStage = useCallback(
    (f: GitChangedFile) => {
      if (busy || !repoRoot) return;
      if (stageState(f) === "checked") {
        run(`unstage:${f.path}`, native.gitUnstage(repoRoot, [f.path]));
      } else {
        run(`stage:${f.path}`, native.gitStage(repoRoot, [f.path]));
      }
    },
    [busy, repoRoot, run],
  );

  const stageAll = useCallback(() => {
    if (busy || !repoRoot) return;
    const paths = files
      .filter((f) => stageState(f) !== "checked")
      .map((f) => f.path);
    if (paths.length === 0) return;
    run("all", native.gitStage(repoRoot, paths));
  }, [busy, repoRoot, files, run]);

  const stageableCount = files.filter(
    (f) => stageState(f) !== "checked",
  ).length;

  const diffAbs =
    diffFile && repoRoot
      ? joinPath(repoRoot.replace(/\\/g, "/"), diffFile.path.replace(/\\/g, "/"))
      : null;

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-border/60 bg-card/80 [contain:layout_style]">
      <header className="flex shrink-0 items-center gap-1.5 border-b border-border/50 px-2.5 py-1.5">
        <HugeiconsIcon
          icon={FolderGitTwoIcon}
          size={12}
          strokeWidth={1.9}
          className="shrink-0 text-muted-foreground"
        />
        <span className="max-w-[40%] truncate text-[11.5px] font-medium leading-none">
          {sc.hasRepo
            ? (sc.status?.isDetached ? "detached" : sc.status?.branch) ??
              "git status"
            : "git status"}
        </span>
        {sc.hasRepo && files.length > 0 ? (
          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-border/60 px-1 text-[9.5px] font-semibold tabular-nums text-muted-foreground">
            {files.length}
          </span>
        ) : null}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {sc.hasRepo && stageableCount > 0 ? (
            <button
              type="button"
              onClick={stageAll}
              disabled={!!busy || !repoRoot}
              title="Stage all changes (git add -A)"
              className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
            >
              <HugeiconsIcon icon={PlusSignIcon} size={10} strokeWidth={2.2} />
              Add all
            </button>
          ) : null}
          <span
            className="inline-block size-1.5 rounded-full bg-emerald-500/70"
            title="Live"
            aria-hidden
          />
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close git status pane"
              title="Close pane"
              className="inline-flex size-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={13} strokeWidth={1.9} />
            </button>
          ) : null}
        </div>
      </header>

      {!sc.hasRepo ? (
        <Center
          title={sc.isLoading ? "Loading…" : "No repository"}
          body={
            sc.isLoading
              ? undefined
              : "This pane's folder is not inside a Git repository."
          }
        />
      ) : files.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-4 text-center">
          <div className="flex size-7 items-center justify-center rounded-full border border-border/55 text-muted-foreground">
            <HugeiconsIcon
              icon={CheckmarkCircle01Icon}
              size={15}
              strokeWidth={1.6}
            />
          </div>
          <div className="text-[11.5px] font-medium">Working tree clean</div>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden [scrollbar-gutter:stable]">
          {files.map((f) => {
            const code = shortCode(f);
            const norm = f.path.replace(/\\/g, "/");
            const slash = norm.lastIndexOf("/");
            const name = slash >= 0 ? norm.slice(slash + 1) : norm;
            const dir = slash > 0 ? norm.slice(0, slash) : "";
            const deleted = code === "D";
            const stat = stats.get(f.path);
            return (
              <div
                key={f.path}
                className="group flex h-[26px] items-center gap-2 px-2.5 transition-colors hover:bg-accent/40"
              >
                <Checkbox
                  aria-label={`Stage ${norm}`}
                  checked={checkboxValue(stageState(f))}
                  disabled={!!busy || !repoRoot}
                  onCheckedChange={() => toggleStage(f)}
                  className="size-3.5 shrink-0"
                />
                <span
                  className={cn(
                    "inline-flex size-3.5 shrink-0 items-center justify-center rounded-[3px] text-[9px] font-bold text-background",
                    statusAccent(code),
                  )}
                  aria-hidden
                >
                  {code}
                </span>
                <button
                  type="button"
                  disabled={deleted}
                  onClick={() => !deleted && setDiffFile(f)}
                  title={
                    deleted ? norm : `${f.statusLabel || "View diff"}: ${norm}`
                  }
                  className={cn(
                    "min-w-0 flex-1 truncate text-left text-[11.5px] leading-none",
                    deleted ? "cursor-default" : "cursor-pointer",
                  )}
                >
                  <span
                    className={cn(
                      "font-medium",
                      deleted && "line-through opacity-70",
                    )}
                  >
                    {name}
                  </span>
                  {dir ? (
                    <span className="ml-1.5 text-[10px] text-muted-foreground/70">
                      {dir}
                    </span>
                  ) : null}
                </button>
                <ChangeBar stat={stat} untracked={f.untracked} />
              </div>
            );
          })}
        </div>
      )}

      <Dialog
        open={diffFile !== null}
        onOpenChange={(o) => {
          if (!o) setDiffFile(null);
        }}
      >
        <DialogContent className="flex h-[85vh] w-[90vw] max-w-[1100px] flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 flex-row items-center gap-3 border-b border-border/50 px-4 py-2.5">
            <DialogTitle className="min-w-0 flex-1 truncate text-[13px] font-medium">
              {diffFile?.path.replace(/\\/g, "/")}
            </DialogTitle>
            {diffFile ? (
              <ChangeBar stat={stats.get(diffFile.path)} untracked={diffFile.untracked} />
            ) : null}
            {onOpenFile && diffAbs ? (
              <button
                type="button"
                onClick={() => {
                  onOpenFile(diffAbs);
                  setDiffFile(null);
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border/60 bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground"
              >
                <HugeiconsIcon icon={FileEditIcon} size={12} strokeWidth={1.8} />
                Open in editor
              </button>
            ) : null}
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-hidden">
            {diffFile && repoRoot ? (
              <Suspense
                fallback={
                  <div className="flex h-full items-center justify-center">
                    <Spinner className="size-5" />
                  </div>
                }
              >
                <GitDiffPane
                  active
                  source={{
                    kind: "working",
                    repoRoot,
                    path: diffFile.path,
                    mode: "+",
                    originalPath: diffFile.originalPath,
                  }}
                />
              </Suspense>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});

function ChangeBar({
  stat,
  untracked,
}: {
  stat: { added: number; removed: number; isBinary: boolean } | undefined;
  untracked: boolean;
}) {
  if (stat?.isBinary) {
    return (
      <span className="shrink-0 text-[9px] font-medium uppercase tracking-wide text-muted-foreground/70">
        bin
      </span>
    );
  }
  const added = stat?.added ?? 0;
  const removed = stat?.removed ?? 0;
  const total = added + removed;
  if (total === 0) {
    // Untracked files have no numstat entry; mark them as all-new.
    if (untracked) {
      return (
        <span className="shrink-0 text-[9px] font-semibold text-emerald-500/80">
          new
        </span>
      );
    }
    return <span className="w-[58px] shrink-0" aria-hidden />;
  }
  const addPct = Math.round((added / total) * 100);
  return (
    <span
      className="flex shrink-0 items-center gap-1 tabular-nums"
      title={`+${added} −${removed}`}
    >
      <span className="text-[9px] font-semibold text-emerald-500/90">
        +{added}
      </span>
      <span className="flex h-[5px] w-7 overflow-hidden rounded-full bg-muted">
        <span
          className="h-full bg-emerald-500/80"
          style={{ width: `${addPct}%` }}
        />
        <span className="h-full flex-1 bg-rose-500/80" />
      </span>
      <span className="text-[9px] font-semibold text-rose-500/90">
        −{removed}
      </span>
    </span>
  );
}

function Center({ title, body }: { title: string; body?: string }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 px-5 text-center">
      <div className="text-[12px] font-medium">{title}</div>
      {body ? (
        <div className="max-w-56 text-[10.5px] leading-relaxed text-muted-foreground">
          {body}
        </div>
      ) : null}
    </div>
  );
}
