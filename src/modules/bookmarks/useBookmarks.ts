import { useCallback, useEffect, useRef, useState } from "react";
import {
  loadBookmarks,
  normalizeBookmarkPath,
  saveBookmarks,
} from "./lib/store";

export type UseBookmarks = {
  bookmarks: string[];
  isBookmarked: (path: string) => boolean;
  addBookmark: (path: string) => void;
  removeBookmark: (path: string) => void;
};

export function useBookmarks(): UseBookmarks {
  const [bookmarks, setBookmarks] = useState<string[]>([]);
  const loadedRef = useRef(false);

  useEffect(() => {
    let active = true;
    void loadBookmarks().then((folders) => {
      if (!active) return;
      loadedRef.current = true;
      setBookmarks(folders);
    });
    return () => {
      active = false;
    };
  }, []);

  const persist = useCallback((next: string[]) => {
    // Don't clobber the store before the initial load lands.
    if (loadedRef.current) void saveBookmarks(next);
  }, []);

  const isBookmarked = useCallback(
    (path: string) => bookmarks.includes(normalizeBookmarkPath(path)),
    [bookmarks],
  );

  const addBookmark = useCallback(
    (path: string) => {
      const normalized = normalizeBookmarkPath(path);
      setBookmarks((prev) => {
        if (prev.includes(normalized)) return prev;
        const next = [...prev, normalized];
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const removeBookmark = useCallback(
    (path: string) => {
      const normalized = normalizeBookmarkPath(path);
      setBookmarks((prev) => {
        if (!prev.includes(normalized)) return prev;
        const next = prev.filter((p) => p !== normalized);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  return { bookmarks, isBookmarked, addBookmark, removeBookmark };
}
