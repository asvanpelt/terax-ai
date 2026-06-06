import { invoke } from "@tauri-apps/api/core";
import { LazyStore } from "@tauri-apps/plugin-store";

let cached: string | undefined;

/**
 * Picks the workspace start directory by precedence: an explicit CLI path
 * (`terax ~/proj`) always wins, then the user's configured default workspace
 * dir, then the process launch cwd. All inputs are pre-validated; this is the
 * pure decision so the precedence can be locked by a test.
 */
export function resolveStartDir(
  cliDir: string | null,
  customDir: string | null,
  fallbackDir: string | null,
): string | undefined {
  return cliDir ?? customDir ?? fallbackDir ?? undefined;
}

async function readDefaultWorkspaceDir(): Promise<string | null> {
  try {
    const store = new LazyStore("terax-settings.json");
    const dir = (await store.get<string>("defaultWorkspaceDir"))?.trim();
    if (!dir) return null;
    // workspace_authorize canonicalizes and errors on a missing dir, so it
    // both validates the path and authorizes it for the PTY/git/fs surface.
    return await invoke<string>("workspace_authorize", { path: dir });
  } catch {
    return null;
  }
}

export async function initLaunchDir(): Promise<void> {
  const cliDir = await invoke<string | null>("get_launch_dir").catch(
    () => null,
  );
  const customDir = cliDir ? null : await readDefaultWorkspaceDir();
  const fallbackDir = await invoke<string>("workspace_current_dir").catch(
    () => null,
  );
  const dir = resolveStartDir(cliDir, customDir, fallbackDir);
  cached = dir ? dir.replace(/\\/g, "/") : undefined;
}

export function getLaunchDir(): string | undefined {
  return cached;
}
