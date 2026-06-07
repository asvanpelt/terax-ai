import { LazyStore } from "@tauri-apps/plugin-store";

const STORE_PATH = "terax-bookmarks.json";
const KEY = "folders";

const store = new LazyStore(STORE_PATH, { defaults: {}, autoSave: 200 });

/** Canonical form mirrors the rest of the frontend: forward slashes, no
 *  trailing separator. Keeps dedupe and basename stable across platforms. */
export function normalizeBookmarkPath(path: string): string {
  const slashed = path.replace(/\\/g, "/").replace(/\/+$/, "");
  return slashed.length ? slashed : path;
}

export function bookmarkName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : path;
}

export async function loadBookmarks(): Promise<string[]> {
  const stored = (await store.get<string[]>(KEY)) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of stored) {
    if (typeof raw !== "string") continue;
    const path = normalizeBookmarkPath(raw);
    if (seen.has(path)) continue;
    seen.add(path);
    out.push(path);
  }
  return out;
}

export async function saveBookmarks(folders: string[]): Promise<void> {
  await store.set(KEY, folders);
  await store.save();
}
