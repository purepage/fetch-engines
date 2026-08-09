import { describe, expect, it } from "vitest";
import { extractHtmlTitle } from "../src/utils/html-metadata.js";

describe("extractHtmlTitle", () => {
  it("extracts a normal title", () => {
    expect(extractHtmlTitle("<html><head><title>Example page</title></head></html>")).toBe("Example page");
  });

  it("decodes named, decimal, and hexadecimal entities", () => {
    expect(extractHtmlTitle("<title>Named &amp; decimal &#39; hex &#x1F600;</title>")).toBe("Named & decimal ' hex 😀");
  });

  it("trims titles and returns null for empty titles", () => {
    expect(extractHtmlTitle("<title> \n Example page \t</title>")).toBe("Example page");
    expect(extractHtmlTitle("<title> \n\t </title>")).toBeNull();
  });

  it("extracts text from nested markup", () => {
    expect(extractHtmlTitle("<title>Nested <strong>title</strong></title>")).toBe("Nested title");
  });

  it("returns the first applicable title, including an empty first title", () => {
    expect(extractHtmlTitle("<title>First</title><title>Second</title>")).toBe("First");
    expect(extractHtmlTitle("<title> \n\t </title><title>Second</title>")).toBeNull();
  });

  it("ignores title-like literals in comments and raw-text elements", () => {
    const html = `
      <!-- <title>Comment title</title> -->
      <script>const template = "<title>Script title</title>";</script>
      <style>.example::before { content: "<title>Style title</title>"; }</style>
      <noscript><title>Noscript title</title></noscript>
      <textarea><title>Textarea title</title></textarea>
      <title>Genuine title</title>
    `;

    expect(extractHtmlTitle(html)).toBe("Genuine title");
  });

  it("ignores titles in foreign, inert, and raw-text contexts", () => {
    for (const tagName of ["svg", "math", "template", "select", "noscript", "iframe", "xmp", "noembed", "noframes"]) {
      expect(extractHtmlTitle(`<${tagName}><title>fake</title></${tagName}><title>real</title>`)).toBe("real");
    }
  });

  it("treats plaintext as terminal content", () => {
    expect(extractHtmlTitle("<plaintext><title>fake</title></plaintext><title>real</title>")).toBeNull();
  });
});
