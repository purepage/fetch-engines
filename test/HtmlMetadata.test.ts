import { describe, expect, it } from "vitest";
import { extractHtmlTitle } from "../src/utils/html-metadata.js";

describe("extractHtmlTitle", () => {
  it("extracts a normal title", () => {
    expect(extractHtmlTitle("<html><head><title>Example page</title></head></html>")).toBe("Example page");
  });

  it("decodes numeric, named, and hexadecimal entities", () => {
    expect(extractHtmlTitle("<title>Numeric &#39; named &amp; hex &#x1F600;</title>")).toBe("Numeric ' named & hex 😀");
  });

  it("returns null when no title exists", () => {
    expect(extractHtmlTitle("<html><head></head><body>Content</body></html>")).toBeNull();
  });

  it("returns null for an empty or whitespace-only title", () => {
    expect(extractHtmlTitle("<title></title>")).toBeNull();
    expect(extractHtmlTitle("<title> \n\t </title>")).toBeNull();
  });

  it("matches title elements case-insensitively and ignores attributes", () => {
    expect(extractHtmlTitle('<TITLE data-source="test">Case and attributes</TITLE>')).toBe("Case and attributes");
  });

  it("extracts an unclosed title", () => {
    expect(extractHtmlTitle("<html><head><title>Unclosed title")).toBe("Unclosed title");
  });

  it("extracts text from nested markup", () => {
    expect(extractHtmlTitle("<title>Nested <strong>title</strong></title>")).toBe("Nested title");
  });

  it("returns the first title when multiple titles exist", () => {
    expect(extractHtmlTitle("<title>First</title><title>Second</title>")).toBe("First");
  });
});
