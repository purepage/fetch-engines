import { describe, expect, it } from "vitest";
import { extractHtmlTitle } from "../src/utils/html-metadata.js";

describe("extractHtmlTitle", () => {
  it("extracts a normal title", () => {
    expect(extractHtmlTitle("<html><head><title>Example page</title></head></html>")).toBe("Example page");
  });

  it("does not retain closing-tag search state between calls", () => {
    expect(extractHtmlTitle("<title>This title is deliberately long enough to exceed prior matches</title>")).toBe(
      "This title is deliberately long enough to exceed prior matches"
    );
    expect(extractHtmlTitle("<title>Short</title>")).toBe("Short");
  });

  it("ignores titles in foreign and inert element contexts", () => {
    for (const tagName of ["svg", "math", "template", "select", "noscript"]) {
      expect(extractHtmlTitle(`<${tagName}><title>fake</title></${tagName}><title>real</title>`)).toBe("real");
    }
  });

  it("keeps a title directly in the body because document.title exposes it", () => {
    expect(extractHtmlTitle("<body><title>Body title</title></body>")).toBe("Body title");
  });

  it("does not treat self-closing foreign content as a title context", () => {
    expect(extractHtmlTitle("<svg/><title>SVG-adjacent title</title>")).toBe("SVG-adjacent title");
    expect(extractHtmlTitle("<math/><title>Math-adjacent title</title>")).toBe("Math-adjacent title");
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

  it("returns null for an unclosed title at EOF or before the document ends", () => {
    expect(extractHtmlTitle("<html><head><title>Unclosed title")).toBeNull();
    expect(extractHtmlTitle("<html><head><title>Unclosed title</head><body>Content</body></html>")).toBeNull();
  });

  it("extracts text from nested markup", () => {
    expect(extractHtmlTitle("<title>Nested <strong>title</strong></title>")).toBe("Nested title");
  });

  it("does not append synthetic comment text to malformed nested title markup", () => {
    expect(extractHtmlTitle("<title>Nested <strong>title</title>")).toBe("Nested title");
  });

  it("returns the first title when multiple titles exist", () => {
    expect(extractHtmlTitle("<title>First</title><title>Second</title>")).toBe("First");
  });

  it("does not skip an empty first genuine title for a later title", () => {
    expect(extractHtmlTitle("<title> \n\t </title><title>Second</title>")).toBeNull();
  });

  it("ignores title-like literals outside genuine title elements", () => {
    const html = `
      <!-- <title>Comment title</title> -->
      <script>const template = "<title>Script title</title>";</script>
      <style>.example::before { content: "<title>Style title</title>"; }</style>
      <textarea><title>Textarea title</title></textarea>
      <div data-template="<title>Attribute title</title>"></div>
      <title>Genuine title</title>
    `;

    expect(extractHtmlTitle(html)).toBe("Genuine title");
  });

  it("does not promote title-like literals from an unclosed quoted attribute", () => {
    expect(extractHtmlTitle('<div data-template="<title>fake one</title><title>fake two</title>')).toBeNull();
  });

  it("ignores title-like syntax in unquoted attribute text", () => {
    expect(extractHtmlTitle("<div data-template=<title>fake</title>><title>real</title>")).toBe("real");
  });

  it("ignores titles inside foreign content despite quoted closing-tag text", () => {
    expect(extractHtmlTitle('<svg><g data-x="</svg>"><title>fake</title></g></svg><title>real</title>')).toBe("real");
  });

  it("ignores title-like literals in markup declarations and processing instructions", () => {
    expect(extractHtmlTitle('<!DOCTYPE html SYSTEM "<title>fake</title>"><title>real</title>')).toBe("real");
    expect(extractHtmlTitle('<?instruction value="<title>fake</title>"?><title>real</title>')).toBe("real");
  });

  it("treats slash-form raw-text elements as non-void starts", () => {
    expect(extractHtmlTitle("<script/><title>fake</title></script><title>real</title>")).toBe("real");
    expect(extractHtmlTitle("<style/><title>fake</title></style><title>real</title>")).toBe("real");
    expect(extractHtmlTitle("<textarea/><title>fake</title></textarea><title>real</title>")).toBe("real");
  });

  it("does not recognize a title prefix followed by an invalid tag-name delimiter", () => {
    expect(extractHtmlTitle("<title=not-a-tag>fake</title><title>real</title>")).toBe("real");
  });

  it("ignores title-like literals in the remaining standard raw-text elements", () => {
    for (const tagName of ["xmp", "iframe", "noembed", "noframes"]) {
      expect(extractHtmlTitle(`<${tagName}><title>fake</title></${tagName}><title>real</title>`)).toBe("real");
    }
  });

  it("recognizes recoverable slash and attribute raw-text closing syntax", () => {
    expect(extractHtmlTitle("<script><title>fake</title></script/><title>real</title>")).toBe("real");
    expect(extractHtmlTitle("<style><title>fake</title></style x><title>real</title>")).toBe("real");
  });

  it("recognizes recoverable closing syntax for slash-form raw-text elements", () => {
    expect(extractHtmlTitle("<script/>fake </script ><title>real</title>")).toBe("real");
    expect(extractHtmlTitle("<style/>fake </style/><title>real</title>")).toBe("real");
  });

  it("does not treat an invalid closing tag delimiter as closing a slash-form raw-text element", () => {
    expect(extractHtmlTitle("<script/><title>fake</title></script!><title>real</title>")).toBeNull();
    expect(extractHtmlTitle("<style/><title>fake</title></style!><title>real</title>")).toBeNull();
  });

  it("does not treat Unicode whitespace as a valid raw-text closing tag delimiter", () => {
    for (const ws of ["\u00a0", "\u2003"]) {
      expect(extractHtmlTitle(`<script/><title>fake</title></script${ws}><title>real</title>`)).toBeNull();
      expect(extractHtmlTitle(`<style/><title>fake</title></style${ws}><title>real</title>`)).toBeNull();
    }
  });

  it("does not treat Unicode whitespace as a valid title closing tag delimiter", () => {
    for (const ws of ["\u00a0", "\u2003"]) {
      expect(extractHtmlTitle(`<title>hello</title${ws}>`)).toBeNull();
    }
  });

  it("still accepts ASCII whitespace as a closing tag delimiter", () => {
    expect(extractHtmlTitle("<title>hello</title >")).toBe("hello");
    expect(extractHtmlTitle("<title>hello</title\t>")).toBe("hello");
    expect(extractHtmlTitle("<script/><title>fake</title></script ><title>real</title>")).toBe("real");
    expect(extractHtmlTitle("<script/><title>fake</title></script\t><title>real</title>")).toBe("real");
  });

  it("treats <plaintext> as terminal raw text and ignores any subsequent title", () => {
    expect(extractHtmlTitle("<plaintext><title>fake</title>")).toBeNull();
    expect(extractHtmlTitle("<plaintext><title>fake</title><title>real</title>")).toBeNull();
  });

  it("supports the HTML alternate comment terminator --!>", () => {
    expect(extractHtmlTitle("<!-- ignored --!><title>real</title>")).toBe("real");
    expect(extractHtmlTitle("<!-- ignored --><title>real</title>")).toBe("real");
    expect(extractHtmlTitle("<!-- ignored --!<title>real</title>")).toBeNull();
  });

  it("returns null when the only closing-title syntax is inside an attribute value", () => {
    expect(extractHtmlTitle('<title>Unclosed <span data-x="</title>">text</span>')).toBeNull();
  });
});
