import { describe, expect, it } from "vitest";
import { resolveStartDir } from "./launchDir";

describe("resolveStartDir", () => {
  it("prefers an explicit CLI dir over everything", () => {
    expect(resolveStartDir("/cli", "/custom", "/fallback")).toBe("/cli");
  });

  it("uses the custom default dir when there is no CLI dir", () => {
    expect(resolveStartDir(null, "/custom", "/fallback")).toBe("/custom");
  });

  it("falls back to the launch cwd when no CLI or custom dir", () => {
    expect(resolveStartDir(null, null, "/fallback")).toBe("/fallback");
  });

  it("returns undefined when nothing resolves", () => {
    expect(resolveStartDir(null, null, null)).toBeUndefined();
  });
});
