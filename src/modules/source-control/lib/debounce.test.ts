import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDebounced } from "./debounce";

describe("createDebounced", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("collapses a burst into a single trailing call", () => {
    const fn = vi.fn();
    const d = createDebounced(fn, 300);
    d.schedule();
    d.schedule();
    d.schedule();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("fires again for a new burst after the quiet gap", () => {
    const fn = vi.fn();
    const d = createDebounced(fn, 300);
    d.schedule();
    vi.advanceTimersByTime(300);
    d.schedule();
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("cancel() drops the pending call", () => {
    const fn = vi.fn();
    const d = createDebounced(fn, 300);
    d.schedule();
    d.cancel();
    vi.advanceTimersByTime(300);
    expect(fn).not.toHaveBeenCalled();
  });
});
