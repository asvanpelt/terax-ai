import { describe, expect, it } from "vitest";
import { bookmarkName, normalizeBookmarkPath } from "./store";

describe("normalizeBookmarkPath", () => {
  it("converts backslashes to forward slashes", () => {
    expect(normalizeBookmarkPath("C:\\Users\\me\\proj")).toBe("C:/Users/me/proj");
  });

  it("strips trailing separators", () => {
    expect(normalizeBookmarkPath("/Users/me/proj/")).toBe("/Users/me/proj");
    expect(normalizeBookmarkPath("/Users/me/proj//")).toBe("/Users/me/proj");
  });

  it("keeps the original when it would normalize to empty", () => {
    expect(normalizeBookmarkPath("/")).toBe("/");
  });

  it("makes equivalent paths compare equal across separators", () => {
    expect(normalizeBookmarkPath("C:\\a\\b\\")).toBe(
      normalizeBookmarkPath("C:/a/b"),
    );
  });
});

describe("bookmarkName", () => {
  it("returns the last path segment", () => {
    expect(bookmarkName("/Users/me/projects/terax")).toBe("terax");
    expect(bookmarkName("C:\\Users\\me\\terax")).toBe("terax");
  });

  it("ignores trailing separators", () => {
    expect(bookmarkName("/Users/me/terax/")).toBe("terax");
  });
});
