import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  copyToClipboard,
  folderIconUrl,
  revealInFinder,
} from "@/modules/explorer";
import { BookmarkIcon, FolderAddIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { open } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";
import { bookmarkName } from "./lib/store";

const COMPACT_ITEM = "rounded-xl px-2.5 py-1.5 text-xs gap-2";
const COMPACT_CONTENT = "min-w-44 rounded-2xl p-1";

type Props = {
  bookmarks: string[];
  onOpenFolder: (path: string) => void;
  onOpenInTerminal: (path: string) => void;
  onAddBookmark: (path: string) => void;
  onRemoveBookmark: (path: string) => void;
};

export function BookmarksPanel({
  bookmarks,
  onOpenFolder,
  onOpenInTerminal,
  onAddBookmark,
  onRemoveBookmark,
}: Props) {
  const browse = useCallback(async () => {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Add folder to bookmarks",
    }).catch(() => null);
    if (typeof picked === "string") onAddBookmark(picked);
  }, [onAddBookmark]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-8 shrink-0 items-center gap-1 border-b border-border/60 px-2">
        <span className="flex flex-1 items-center gap-1.5 truncate px-1 text-xs font-medium text-foreground/80">
          <HugeiconsIcon icon={BookmarkIcon} size={13} strokeWidth={1.75} />
          Bookmarks
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="size-6 text-muted-foreground hover:text-foreground"
          onClick={() => void browse()}
          title="Add folder"
          aria-label="Add folder to bookmarks"
        >
          <HugeiconsIcon icon={FolderAddIcon} size={13} strokeWidth={2} />
        </Button>
      </div>

      {bookmarks.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 p-6 text-center">
          <HugeiconsIcon
            icon={BookmarkIcon}
            size={22}
            strokeWidth={1.5}
            className="text-muted-foreground"
          />
          <div className="text-xs text-muted-foreground">
            No bookmarks yet
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => void browse()}
          >
            Add folder
          </Button>
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-1 [scrollbar-gutter:stable]">
          {bookmarks.map((path) => (
            <ContextMenu key={path}>
              <ContextMenuTrigger asChild>
                <button
                  type="button"
                  onClick={() => onOpenFolder(path)}
                  title={path}
                  className="group flex h-6 w-full min-w-0 cursor-pointer items-center gap-2 px-2.5 text-left text-[13px] text-foreground/85 transition-colors hover:bg-accent/70"
                >
                  <img
                    src={folderIconUrl(bookmarkName(path), false)}
                    alt=""
                    className="size-4 shrink-0"
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {bookmarkName(path)}
                  </span>
                </button>
              </ContextMenuTrigger>
              <ContextMenuContent className={COMPACT_CONTENT}>
                <ContextMenuItem
                  className={COMPACT_ITEM}
                  onSelect={() => onOpenFolder(path)}
                >
                  Open Git Layout
                </ContextMenuItem>
                <ContextMenuItem
                  className={COMPACT_ITEM}
                  onSelect={() => onOpenInTerminal(path)}
                >
                  Open in Terminal
                </ContextMenuItem>
                <ContextMenuItem
                  className={COMPACT_ITEM}
                  onSelect={() => void revealInFinder(path)}
                >
                  Reveal in Finder
                </ContextMenuItem>
                <ContextMenuItem
                  className={COMPACT_ITEM}
                  onSelect={() => void copyToClipboard(path)}
                >
                  Copy Path
                </ContextMenuItem>
                <ContextMenuSeparator />
                <ContextMenuItem
                  className={COMPACT_ITEM}
                  variant="destructive"
                  onSelect={() => onRemoveBookmark(path)}
                >
                  Remove from Bookmarks
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          ))}
        </div>
      )}
    </div>
  );
}
