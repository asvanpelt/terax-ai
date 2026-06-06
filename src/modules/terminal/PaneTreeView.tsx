import { Fragment } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { GitStatusPane } from "@/modules/source-control";
import type { SearchAddon } from "@xterm/addon-search";
import { TerminalPane, type TerminalPaneHandle } from "./TerminalPane";
import { useTerminalDropStore } from "./lib/dropStore";
import type { PaneNode } from "./lib/panes";

type LeafBundle = {
  setRef: (h: TerminalPaneHandle | null) => void;
  onSearch: (addon: SearchAddon) => void;
  onCwd: (cwd: string) => void;
  onExit: (code: number) => void;
};

type Props = {
  node: PaneNode;
  tabVisible: boolean;
  activeLeafId: number;
  blocks: boolean;
  onFocusLeaf: (leafId: number) => void;
  getBundle: (leafId: number) => LeafBundle;
  onOpenFile?: (absolutePath: string) => void;
};

export function PaneTreeView({
  node,
  tabVisible,
  activeLeafId,
  blocks,
  onFocusLeaf,
  getBundle,
  onOpenFile,
}: Props) {
  if (node.kind === "leaf") {
    const focused = node.id === activeLeafId;
    return (
      <div
        onMouseDownCapture={() => {
          if (!focused) onFocusLeaf(node.id);
        }}
        // Catches focus from Tab, programmatic focus, or any path that
        // skips mousedown — keeps activeLeafId in sync with DOM focus.
        onFocus={() => {
          if (!focused) onFocusLeaf(node.id);
        }}
        data-pane-leaf={node.id}
        className="relative h-full w-full"
      >
        {node.view === "git-status" ? (
          // A git-status leaf renders a live status view and spawns no PTY:
          // TerminalPane (and its useTerminalSession hook) is never mounted.
          <GitStatusPane
            cwd={node.cwd}
            enabled={tabVisible}
            onOpenFile={onOpenFile}
          />
        ) : (
          <>
            <TerminalPane
              leafId={node.id}
              visible={tabVisible}
              focused={focused}
              initialCwd={node.cwd}
              blocks={blocks}
              ref={getBundle(node.id).setRef}
              onSearchReady={(_id, addon) => getBundle(node.id).onSearch(addon)}
              onCwd={(_id, cwd) => getBundle(node.id).onCwd(cwd)}
              onExit={(_id, code) => getBundle(node.id).onExit(code)}
            />
            <DropOverlay leafId={node.id} />
          </>
        )}
      </div>
    );
  }

  return (
    <ResizablePanelGroup
      orientation={node.dir === "row" ? "horizontal" : "vertical"}
    >
      {node.children.map((child, i) => (
        <Fragment key={child.id}>
          {i > 0 && <ResizableHandle />}
          <ResizablePanel id={`pane-${child.id}`} minSize="10%">
            <PaneTreeView
              node={child}
              tabVisible={tabVisible}
              activeLeafId={activeLeafId}
              blocks={blocks}
              onFocusLeaf={onFocusLeaf}
              getBundle={getBundle}
              onOpenFile={onOpenFile}
            />
          </ResizablePanel>
        </Fragment>
      ))}
    </ResizablePanelGroup>
  );
}

function DropOverlay({ leafId }: { leafId: number }) {
  const active = useTerminalDropStore((s) => s.targetLeafId === leafId);
  if (!active) return null;
  return (
    <div className="pointer-events-none absolute inset-2 grid place-items-center rounded-lg border border-primary/45 bg-background/70 text-xs font-medium text-foreground shadow-lg backdrop-blur-sm">
      Drop file path here
    </div>
  );
}
