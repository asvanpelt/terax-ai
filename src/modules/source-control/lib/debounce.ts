export type Debounced = {
  /** Arm (or re-arm) the trailing call. */
  schedule: () => void;
  /** Drop any pending call. */
  cancel: () => void;
};

/**
 * Trailing-edge debounce: collapses a burst of `schedule()` calls into a
 * single `fn()` fired once the burst has been quiet for `delayMs`. Used to
 * coalesce filesystem-change events (a save, or a commit's several `.git`
 * writes) into one git status refresh.
 */
export function createDebounced(fn: () => void, delayMs: number): Debounced {
  let timer: ReturnType<typeof setTimeout> | null = null;
  return {
    schedule() {
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        fn();
      }, delayMs);
    },
    cancel() {
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
  };
}
