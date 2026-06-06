import { cn } from "@/lib/utils";
import { joinPath } from "@/modules/explorer/lib/useFileTree";
import {
  CheckmarkCircle01Icon,
  FolderGitTwoIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { memo } from "react";
import { useSourceControl } from "./useSourceControl";

type Props = {
  cwd: string | undefined;
  enabled?: boolean;
  onOpenFile?: (absolutePath: string) => void;
};

// git porcelain code -> accent color, mirroring SourceControlPanel.
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

function shortCode(file: {
  indexStatus: string;
  worktreeStatus: string;
  untracked: boolean;
}): string {
  if (file.untracked) return "?";
  const code = (file.worktreeStatus || file.indexStatus || "").trim();
  return code ? code[0].toUpperCase() : "M";
}

/**
 * A live, read-only `git status` view sized to live inside a terminal split
 * pane. It reuses useSourceControl (already event-driven via the fs watcher),
 * so it updates on its own and never spawns a PTY.
 */
export const GitStatusPane = memo(function GitStatusPane({
  cwd,
  enabled = true,
  onOpenFile,
}: Props) {
  const sc = useSourceControl(cwd ?? null, enabled);
  const repoRoot = sc.repo?.repoRoot ?? sc.status?.repoRoot ?? null;
  const files = sc.status?.changedFiles ?? [];

  return (
    <div className="flex h-full min-h-0 flex-col rounded-lg border border-border/60 bg-card/80 [contain:layout_style]">
      <header className="flex shrink-0 items-center gap-1.5 border-b border-border/50 px-2.5 py-1.5">
        <HugeiconsIcon
          icon={FolderGitTwoIcon}
          size={12}
          strokeWidth={1.9}
          className="shrink-0 text-muted-foreground"
        />
        <span className="max-w-[55%] truncate text-[11.5px] font-medium leading-none">
          {sc.hasRepo
            ? (sc.status?.isDetached ? "detached" : sc.status?.branch) ??
              "git status"
            : "git status"}
        </span>
        {sc.hasRepo ? (
          <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full border border-border/60 px-1 text-[9.5px] font-semibold tabular-nums text-muted-foreground">
            {files.length}
          </span>
        ) : null}
        <span
          className="ml-1 inline-block size-1.5 shrink-0 rounded-full bg-emerald-500/70"
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
            return (
              <button
                key={f.path}
                type="button"
                disabled={!clickable}
                onClick={() => clickable && abs && onOpenFile?.(abs)}
                title={f.statusLabel ? `${f.statusLabel}: ${norm}` : norm}
                className={cn(
                  "group flex h-[26px] w-full items-center gap-2 px-2.5 text-left transition-colors",
                  clickable
                    ? "cursor-pointer hover:bg-accent/40"
                    : "cursor-default",
                )}
              >
                <span
                  className={cn(
                    "inline-flex size-3.5 shrink-0 items-center justify-center rounded-[3px] text-[9px] font-bold text-background",
                    statusAccent(code),
                  )}
                  aria-hidden
                >
                  {code}
                </span>
                <span className="min-w-0 flex-1 truncate text-[11.5px] leading-none">
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
                </span>
              </button>
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
