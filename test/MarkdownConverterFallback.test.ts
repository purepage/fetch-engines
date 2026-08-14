import { describe, expect, it, vi } from "vitest";

vi.mock("@kreuzberg/html-to-markdown", () => ({
  convert: vi.fn(() => {
    throw new Error("native converter panic");
  }),
}));

import { MarkdownConverter } from "../src/utils/markdown-converter.js";

describe("MarkdownConverter fallback", () => {
  it("should return Markdown when the native converter panics", () => {
    const converter = new MarkdownConverter();

    const markdown = converter.convert(
      '<main><h1>Pure Devotion</h1><p>Overmono release on <a href="/labels/xl">XL Recordings</a>.</p></main>',
      { baseUrl: "https://www.juno.co.uk/products/pure-devotion/" }
    );

    expect(markdown).toContain("# Pure Devotion");
    expect(markdown).toContain("Overmono release");
    expect(markdown).toContain("https://www.juno.co.uk/labels/xl");
  });
});
