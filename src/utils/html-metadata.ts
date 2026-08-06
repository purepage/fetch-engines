import { parse } from "node-html-parser";

export function extractHtmlTitle(html: string): string | null {
  const parsedTitle = parse(html).querySelector("title")?.textContent.trim();
  if (parsedTitle) {
    return parsedTitle;
  }

  const unclosedTitle = html.match(/<title\b[^>]*>([\s\S]*)/i)?.[1];
  return unclosedTitle ? parse(`<title>${unclosedTitle}`).querySelector("title")?.textContent.trim() || null : null;
}
