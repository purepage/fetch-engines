import { parse, type HTMLElement } from "node-html-parser";

const TITLE_IGNORING_ANCESTORS = new Set([
  "svg",
  "math",
  "template",
  "select",
  "noscript",
  "script",
  "style",
  "textarea",
  "xmp",
  "iframe",
  "noembed",
  "noframes",
  "plaintext",
]);
const RAW_TEXT_TAGS = new Set(["script", "style", "textarea", "xmp", "iframe", "noembed", "noframes"]);

const WHITESPACE = /\s/;
const TAG_NAME_CHARACTER = /[A-Za-z0-9:-]/;

/** Masks non-markup text without changing source offsets used by the parser. */
function maskNonMarkup(html: string): string {
  const masked = html.split("");
  const blank = (start: number, end: number) => masked.fill(" ", start, end);

  for (let start = 0; start < html.length; start++) {
    if (html[start] !== "<") continue;

    if (html.startsWith("<!--", start)) {
      const ends = [html.indexOf("-->", start + 4), html.indexOf("--!>", start + 4)].filter((end) => end !== -1);
      const end = ends.length === 0 ? html.length : Math.min(...ends) + 3;
      blank(start, end);
      start = end - 1;
      continue;
    }

    if (html[start + 1] === "!" || html[start + 1] === "?") {
      let quote: string | undefined;
      let end = start + 2;
      for (; end < html.length; end++) {
        if (quote) {
          if (html[end] === quote) quote = undefined;
        } else if (html[end] === '"' || html[end] === "'") {
          quote = html[end];
        } else if (html[end] === ">") {
          end++;
          break;
        }
      }
      blank(start, end);
      start = end - 1;
      continue;
    }

    if (!/[A-Za-z]/.test(html[start + 1] ?? "")) continue;

    let cursor = start + 1;
    while (TAG_NAME_CHARACTER.test(html[cursor] ?? "")) cursor++;

    for (; cursor < html.length && html[cursor] !== ">"; cursor++) {
      if (html[cursor] !== "=") continue;

      let valueStart = cursor + 1;
      while (WHITESPACE.test(html[valueStart] ?? "")) valueStart++;

      const quote = html[valueStart];
      const quoted = quote === '"' || quote === "'";
      let valueEnd = valueStart + (quoted ? 1 : 0);
      while (
        valueEnd < html.length &&
        (quoted ? html[valueEnd] !== quote : !WHITESPACE.test(html[valueEnd]) && html[valueEnd] !== ">")
      ) {
        valueEnd++;
      }

      blank(valueStart + Number(quoted), valueEnd);
      cursor = valueEnd;
    }
    start = cursor;
  }

  return masked.join("");
}

function isInTitleIgnoringContext(element: HTMLElement): boolean {
  for (let parent = element.parentNode; parent; parent = parent.parentNode) {
    if (TITLE_IGNORING_ANCESTORS.has(parent.rawTagName?.toLowerCase())) return true;
  }
  return false;
}

function isInsideSlashRawTextElement(
  title: HTMLElement,
  elements: HTMLElement[],
  html: string,
  maskedHtml: string
): boolean {
  return elements.some((element) => {
    const tagName = element.rawTagName.toLowerCase();
    const openingEnd = maskedHtml.indexOf(">", element.range[0]) + 1;
    if (!RAW_TEXT_TAGS.has(tagName) || !/\/\s*>$/.test(maskedHtml.slice(element.range[0], openingEnd))) return false;

    const closer = new RegExp(`</${tagName}(?=[\\t\\n\\f\\r />])[^>]*>`, "i");
    const match = closer.exec(maskedHtml.slice(element.range[1]));
    const closingStart = match ? match.index + element.range[1] : html.length;
    return title.range[0] > element.range[0] && title.range[0] < closingStart;
  });
}

/** Extract the first closed, genuine HTML title from a document. */
export function extractHtmlTitle(html: string): string | null {
  const maskedHtml = maskNonMarkup(html);
  const document = parse(maskedHtml, { blockTextElements: {} });
  const elements = document.querySelectorAll("*");

  for (const title of document.querySelectorAll("title")) {
    if (isInTitleIgnoringContext(title) || isInsideSlashRawTextElement(title, elements, html, maskedHtml)) continue;

    const closingTag = /<\/title[\t\n\f\r ]*>/gi;
    closingTag.lastIndex = title.range[0];
    if (!closingTag.exec(maskedHtml)) continue;

    return title.textContent.trim() || null;
  }

  return null;
}
