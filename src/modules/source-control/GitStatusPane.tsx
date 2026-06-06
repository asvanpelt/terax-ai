import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { native, type GitChangedFile } from "@/modules/ai/lib/native";
import { joinPath } from "@/modules/explorer/lib/useFileTree";
import {
  CheckmarkCircle01Icon,
  FolderGitTwoIcon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo, useCallback, useState } from "react";
import { useSourceControl } from "./useSourceControl";

type Props = {
  cwd: string | undefined;
  enabled?: boolean;
  onOpenFile?: (absolutePath: string) => void;
};

type StageState = "checked" | "indeterminate" | "unchecked";

// "checked" = fully staged, "indeterminate" = staged with further unstaged
// edits, "unchecked" = nothing staged. Mirrors SourceControlPanel semantics.
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
 * A live `git status` view sized to live inside a terminal split pane. Reuses
 * useSourceControl (fs-watcher driven, no PTY), shows the changed files, and
 * lets you stage per file (checkbox) or stage everything ("Add all").
 */
export const GitStatusPane = memo(function GitStatusPane({
  cwd,
  enabled = true,
  onOpenFile,
}: Props) {
  const sc = useSourceControl(cwd ?? null, enabled);
  const repoRoot = sc.repo?.repoRoot ?? sc.status?.repoRoot ?? null;
  const files = sc.status?.changedFiles ?? [];
  const [busy, setBusy] = useState<string | null>(null);

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

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-border/60 bg-card/80 [contain:layout_style]">
      <header className="flex shrink-0 items-center gap-1.5 border-b border-border/50 px-2.5 py-1.5">
        <HugeiconsIcon
          icon={FolderGitTwoIcon}
          size={12}
          strokeWidth={1.9}
          className="shrink-0 text-muted-foreground"
        />
        <span className="max-w-[45%] truncate text-[11.5px] font-medium leading-none">
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
        {sc.hasRepo && stageableCount > 0 ? (
          <button
            type="button"
            onClick={stageAll}
            disabled={!!busy || !repoRoot}
            title="Stage all changes (git add -A)"
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition-colors hover:border-foreground/40 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          >
            <HugeiconsIcon icon={PlusSignIcon} size={10} strokeWidth={2.2} />
            Add all
          </button>
        ) : null}
        <span
          className={cn(
            "inline-block size-1.5 shrink-0 rounded-full bg-emerald-500/70",
            stageableCount > 0 ? "ml-1" : "ml-auto",
          )}
          title="Live"
          aria-hidden
        />
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
            const abs = repoRoot
              ? joinPath(repoRoot.replace(/\\/g, "/"), norm)
              : null;
            const deleted = code === "D";
            const clickable = !!onOpenFile && !!abs && !deleted;
            const rowBusy =
              busy === `stage:${f.path}` || busy === `unstage:${f.path}`;
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
                  className={cn("size-3.5 shrink-0", rowBusy && "opacity-50")}
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
                  disabled={!clickable}
                  onClick={() => clickable && abs && onOpenFile?.(abs)}
                  title={f.statusLabel ? `${f.statusLabel}: ${norm}` : norm}
                  className={cn(
                    "min-w-0 flex-1 truncate text-left text-[11.5px] leading-none",
                    clickable ? "cursor-pointer" : "cursor-default",
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
});

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
