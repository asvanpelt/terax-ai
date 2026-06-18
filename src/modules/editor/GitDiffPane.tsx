import { MergeView, unifiedMergeView } from "@codemirror/merge";
import { EditorState, type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import {
  GitCompareIcon,
  LayoutTwoColumnIcon,
  LayoutTwoRowIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import CodeMirror, {
  getDefaultExtensions,
  type ReactCodeMirrorRef,
} from "@uiw/react-codemirror";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { usePreferencesStore } from "@/modules/settings/preferences";
import {
  commitDiffKey,
  fetchCommitDiff,
  fetchWorkingDiff,
  getCachedDiff,
  workingDiffKey,
} from "./lib/diffCache";
import { buildSharedExtensions, languageCompartment } from "./lib/extensions";
import {
  computeDiffLineStats,
  gitDiffComparison,
} from "./lib/gitDiffPresentation";
import { resolveLanguage, resolveLanguageSync } from "./lib/languageResolver";
import { EDITOR_THEME_EXT } from "./lib/themes";

type WorkingSource = {
  kind: "working";
  repoRoot: string;
  path: string;
  mode: "-" | "+";
  originalPath: string | null;
};

type CommitSource = {
  kind: "commit";
  repoRoot: string;
  sha: string;
  path: string;
  originalPath: string | null;
};

type Props = {
  source: WorkingSource | CommitSource;
  chipLabel?: string;
  active: boolean;
  embedded?: boolean;
};

const LARGE_FILE_THRESHOLD = 256 * 1024;

const SHARED_EXT = buildSharedExtensions();
const READONLY_EXT = [
  EditorState.readOnly.of(true),
  EditorView.editable.of(false),
];
const DIFF_THEME = EditorView.theme({
  "&.cm-merge-b .cm-changedText, .cm-changedText": {
    background: "color-mix(in srgb, #22c55e 24%, transparent) !important",
    borderRadius: "3px",
    padding: "0 1px",
  },
  ".cm-deletedChunk .cm-deletedText, &.cm-merge-a .cm-changedText, &.cm-merge-b .cm-deletedText":
    {
      background: "color-mix(in srgb, #ef4444 25%, transparent) !important",
      borderRadius: "3px",
      padding: "0 1px",
    },
  "&.cm-merge-b .cm-changedLine, .cm-changedLine, .cm-inlineChangedLine": {
    backgroundColor: "color-mix(in srgb, #22c55e 8%, transparent) !important",
  },
  "&.cm-merge-a .cm-changedLine, .cm-deletedChunk": {
    backgroundColor: "color-mix(in srgb, #ef4444 8%, transparent) !important",
  },
  ".cm-deletedChunk": {
    borderLeft: "2px solid color-mix(in srgb, #ef4444 70%, transparent)",
    borderRadius: "3px",
    paddingTop: "1px",
    paddingBottom: "1px",
  },
  "&.cm-merge-b .cm-changedLineGutter, .cm-changedLineGutter": {
    background: "color-mix(in srgb, #22c55e 72%, transparent) !important",
  },
  ".cm-deletedLineGutter, &.cm-merge-a .cm-changedLineGutter": {
    background: "color-mix(in srgb, #ef4444 72%, transparent) !important",
  },
  ".cm-changeGutter": {
    width: "3px !important",
    paddingLeft: "0 !important",
  },
  ".cm-collapsedLines": {
    backgroundColor: "transparent",
    color: "var(--muted-foreground, #9ca3af)",
    fontSize: "10.5px",
    padding: "2px 8px",
    opacity: 0.7,
  },
});

function countDiffLines(patch: string): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (let i = 0; i < patch.length; i++) {
    if (i > 0 && patch.charCodeAt(i - 1) !== 10) continue;
    const c = patch.charCodeAt(i);
    if (c === 43 && patch.charCodeAt(i + 1) !== 43) added++;
    else if (c === 45 && patch.charCodeAt(i + 1) !== 45) removed++;
  }
  if (patch.length > 0 && patch.charCodeAt(0) === 43) added++;
  else if (patch.length > 0 && patch.charCodeAt(0) === 45) removed++;
  return { added, removed };
}

type LoadState =
  | { kind: "idle" }
  | { kind: "loading" }
  | {
      kind: "loaded";
      originalContent: string;
      modifiedContent: string;
      isBinary: boolean;
      fallbackPatch: string;
      truncated: boolean;
    }
  | { kind: "error"; message: string };

function cacheKey(source: WorkingSource | CommitSource): string {
  return source.kind === "working"
    ? workingDiffKey(source.repoRoot, source.path, source.mode)
    : commitDiffKey(source.repoRoot, source.sha, source.path);
}

function loadStateFromCache(source: WorkingSource | CommitSource): LoadState {
  const hit = getCachedDiff(cacheKey(source));
  if (!hit) return { kind: "idle" };
  return {
    kind: "loaded",
    originalContent: hit.originalContent,
    modifiedContent: hit.modifiedContent,
    isBinary: hit.isBinary,
    fallbackPatch: hit.fallbackPatch,
    truncated: hit.truncated,
  };
}

export function GitDiffPane({
  source,
  chipLabel,
  active,
  embedded = false,
}: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cmRef = useRef<ReactCodeMirrorRef>(null);
  const editorThemeId = usePreferencesStore((s) => s.editorTheme);
  const themeExt = EDITOR_THEME_EXT[editorThemeId] ?? EDITOR_THEME_EXT.atomone;
  const [viewMode, setViewMode] = useState<"split" | "unified">("split");
  const [compact, setCompact] = useState(false);
  const [state, setState] = useState<LoadState>(() =>
    active ? loadStateFromCache(source) : { kind: "idle" },
  );

  useEffect(() => {
    if (!active) return;
    const cached = loadStateFromCache(source);
    if (cached.kind === "loaded") {
      setState(cached);
      return;
    }
    let cancelled = false;
    setState({ kind: "loading" });
    const promise =
      source.kind === "working"
        ? fetchWorkingDiff(
            source.repoRoot,
            source.path,
            source.mode,
            source.originalPath,
          )
        : fetchCommitDiff(
            source.repoRoot,
            source.sha,
            source.path,
            source.originalPath,
          );
    promise
      .then((res) => {
        if (cancelled) return;
        setState({
          kind: "loaded",
          originalContent: res.originalContent,
          modifiedContent: res.modifiedContent,
          isBinary: res.isBinary,
          fallbackPatch: res.fallbackPatch,
          truncated: res.truncated,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        setState({
          kind: "error",
          message:
            err && typeof err === "object" && "message" in err
              ? String((err as { message: unknown }).message)
              : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [active, source]);

  const path = source.path;
  const loaded = state.kind === "loaded" ? state : null;
  const originalContent = loaded?.originalContent ?? "";
  const modifiedContent = loaded?.modifiedContent ?? "";
  const isBinary = loaded?.isBinary ?? false;
  const fallbackPatch = loaded?.fallbackPatch ?? "";
  const truncated = loaded?.truncated ?? false;

  const isTooLarge =
    originalContent.length > LARGE_FILE_THRESHOLD ||
    modifiedContent.length > LARGE_FILE_THRESHOLD;
  const useFallback = isBinary || isTooLarge;
  const effectiveViewMode = compact ? "unified" : viewMode;
  const comparison = useMemo(
    () =>
      gitDiffComparison(
        source.kind === "working"
          ? { kind: "working", mode: source.mode }
          : { kind: "commit", chipLabel },
      ),
    [chipLabel, source],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(([entry]) => {
      setCompact((entry?.contentRect.width ?? 0) < 760);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, []);

  const initialLang = useMemo(() => resolveLanguageSync(path), [path]);
  const extensions = useMemo(
    () => [
      ...SHARED_EXT,
      languageCompartment.of(initialLang ?? []),
      ...READONLY_EXT,
      unifiedMergeView({
        original: originalContent,
        mergeControls: false,
        highlightChanges: true,
        gutter: true,
        syntaxHighlightDeletions: true,
        allowInlineDiffs: false,
        collapseUnchanged: { margin: 3, minSize: 6 },
      }),
      DIFF_THEME,
    ],
    [originalContent, initialLang],
  );

  // Resolve and apply syntax highlighting asynchronously when the language pack
  // isn't cached yet. This must wait until the editor is actually mounted
  // (state === "loaded"): the pane renders a spinner while the diff loads, so if
  // the language import resolved first the view would be null and the reconfigure
  // would be silently dropped — leaving the diff unhighlighted until a remount.
  // Keying on `state.kind` re-runs this once the view exists.
  useEffect(() => {
    if (useFallback || initialLang) return;
    if (state.kind !== "loaded") return;
    let cancelled = false;
    resolveLanguage(path).then((ext) => {
      if (cancelled) return;
      const view = cmRef.current?.view;
      if (!view) return;
      view.dispatch({
        effects: languageCompartment.reconfigure(ext ?? []),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [useFallback, path, initialLang, state.kind]);

  const stats = useMemo(
    () =>
      useFallback
        ? countDiffLines(fallbackPatch)
        : computeDiffLineStats(originalContent, modifiedContent),
    [fallbackPatch, modifiedContent, originalContent, useFallback],
  );

  return (
    <div
      ref={rootRef}
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden bg-background",
        !embedded && "rounded-md border border-border/60",
      )}
    >
      <div className="flex min-h-12 shrink-0 items-center justify-between gap-3 border-b border-border/60 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-7 shrink-0 items-center justify-center rounded-md border border-border/60 bg-muted/35 text-muted-foreground">
            <HugeiconsIcon icon={GitCompareIcon} size={15} strokeWidth={1.8} />
          </span>
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="truncate font-mono text-[11.5px] font-medium text-foreground"
                title={path}
              >
                {path}
              </span>
              <Badge
                variant="outline"
                className="h-5 shrink-0 px-1.5 text-[9.5px] font-semibold uppercase tracking-wide"
              >
                {comparison.badge}
              </Badge>
            </div>
            <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
              {comparison.description}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <div className="flex items-center gap-1 rounded-md border border-border/60 bg-muted/20 px-2 py-1 text-[10.5px] font-semibold tabular-nums">
            <span className="text-emerald-600 dark:text-emerald-400">
              +{stats.added}
            </span>
            <span className="text-muted-foreground/40">/</span>
            <span className="text-rose-600 dark:text-rose-400">
              -{stats.removed}
            </span>
          </div>
          {!useFallback && !compact ? (
            <fieldset
              className="flex items-center rounded-md border border-border/60 bg-muted/20 p-0.5"
              aria-label="Diff layout"
            >
              <ViewModeButton
                label="Side by side"
                active={viewMode === "split"}
                onClick={() => setViewMode("split")}
                icon={LayoutTwoColumnIcon}
              />
              <ViewModeButton
                label="Unified"
                active={viewMode === "unified"}
                onClick={() => setViewMode("unified")}
                icon={LayoutTwoRowIcon}
              />
            </fieldset>
          ) : null}
        </div>
      </div>

      <div
        className={cn(
          "grid h-8 shrink-0 items-center border-b border-border/60 bg-muted/15 px-3 text-[10px] font-medium",
          effectiveViewMode === "split" && !useFallback
            ? "grid-cols-2"
            : "grid-cols-[1fr_auto]",
        )}
      >
        {effectiveViewMode === "split" && !useFallback ? (
          <>
            <ComparisonLabel tone="removed" label={comparison.beforeLabel} />
            <ComparisonLabel tone="added" label={comparison.afterLabel} />
          </>
        ) : (
          <>
            <span className="text-muted-foreground">
              {comparison.beforeLabel}
              <span className="mx-1.5 text-muted-foreground/40">to</span>
              {comparison.afterLabel}
            </span>
            <div className="flex items-center gap-3 text-muted-foreground">
              <LegendDot tone="removed" label="Removed" />
              <LegendDot tone="added" label="Added" />
            </div>
          </>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {state.kind === "loading" || state.kind === "idle" ? (
          <div className="flex h-full items-center justify-center gap-2 text-[11px] text-muted-foreground">
            <Spinner className="size-3" />
            Loading diff...
          </div>
        ) : state.kind === "error" ? (
          <div className="flex h-full items-center justify-center px-6 text-center text-[11.5px] text-destructive">
            {state.message}
          </div>
        ) : useFallback ? (
          <div className="relative h-full">
            {isBinary || isTooLarge || truncated ? (
              <div className="absolute right-3 top-2 z-10 flex gap-1.5">
                {isBinary ? (
                  <Badge variant="secondary" className="text-[9.5px]">
                    Binary
                  </Badge>
                ) : null}
                {isTooLarge ? (
                  <Badge variant="secondary" className="text-[9.5px]">
                    Large file
                  </Badge>
                ) : null}
                {truncated ? (
                  <Badge variant="secondary" className="text-[9.5px]">
                    Truncated
                  </Badge>
                ) : null}
              </div>
            ) : null}
            <ScrollArea className="h-full">
              <pre className="min-h-full whitespace-pre-wrap wrap-break-word p-4 pt-10 font-mono text-[12px] leading-relaxed text-muted-foreground">
                {fallbackPatch ||
                  "Diff preview is not available for this file."}
              </pre>
            </ScrollArea>
          </div>
        ) : effectiveViewMode === "split" ? (
          <SideBySideDiff
            path={path}
            originalContent={originalContent}
            modifiedContent={modifiedContent}
            initialLang={initialLang}
            themeExt={themeExt}
          />
        ) : (
          <CodeMirror
            ref={cmRef}
            value={modifiedContent}
            theme={themeExt}
            extensions={extensions}
            editable={false}
            height="100%"
            className="h-full"
            basicSetup={{
              lineNumbers: true,
              foldGutter: true,
              highlightActiveLine: false,
              highlightActiveLineGutter: false,
              searchKeymap: true,
            }}
          />
        )}
      </div>
    </div>
  );
}

function SideBySideDiff({
  path,
  originalContent,
  modifiedContent,
  initialLang,
  themeExt,
}: {
  path: string;
  originalContent: string;
  modifiedContent: string;
  initialLang: Extension | null;
  themeExt: Extension;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    const editorExtensions = [
      ...getDefaultExtensions({
        theme: themeExt,
        readOnly: true,
        editable: false,
        indentWithTab: false,
        basicSetup: {
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          searchKeymap: true,
        },
      }),
      ...SHARED_EXT,
      languageCompartment.of(initialLang ?? []),
      ...READONLY_EXT,
      DIFF_THEME,
    ];
    const merge = new MergeView({
      a: { doc: originalContent, extensions: editorExtensions },
      b: { doc: modifiedContent, extensions: editorExtensions },
      parent: host,
      highlightChanges: true,
      gutter: true,
      collapseUnchanged: { margin: 3, minSize: 6 },
    });

    if (!initialLang) {
      void resolveLanguage(path).then((extension) => {
        if (cancelled || !extension) return;
        merge.a.dispatch({
          effects: languageCompartment.reconfigure(extension),
        });
        merge.b.dispatch({
          effects: languageCompartment.reconfigure(extension),
        });
      });
    }

    return () => {
      cancelled = true;
      merge.destroy();
    };
  }, [initialLang, modifiedContent, originalContent, path, themeExt]);

  return <div ref={hostRef} className="git-diff-split h-full min-h-0" />;
}

function ViewModeButton({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon: typeof LayoutTwoColumnIcon;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "inline-flex size-6 items-center justify-center rounded-[4px] text-muted-foreground transition-colors hover:text-foreground",
        active && "bg-background text-foreground shadow-sm",
      )}
    >
      <HugeiconsIcon icon={icon} size={13} strokeWidth={1.8} />
    </button>
  );
}

function ComparisonLabel({
  tone,
  label,
}: {
  tone: "added" | "removed";
  label: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "added" ? "bg-emerald-500" : "bg-rose-500",
        )}
      />
      <span className="text-muted-foreground">{label}</span>
    </div>
  );
}

function LegendDot({
  tone,
  label,
}: {
  tone: "added" | "removed";
  label: string;
}) {
  return (
    <span className="flex items-center gap-1">
      <span
        className={cn(
          "size-1.5 rounded-full",
          tone === "added" ? "bg-emerald-500" : "bg-rose-500",
        )}
      />
      {label}
    </span>
  );
}
