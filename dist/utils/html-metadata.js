import { parse, HTMLElement } from "node-html-parser";
const TITLE_IGNORING_CONTEXTS = new Set([
    "svg",
    "math",
    "template",
    "select",
    "textarea",
    "iframe",
    "xmp",
    "noembed",
    "noframes",
]);
function findTitle(node, ignoredContext) {
    if (!(node instanceof HTMLElement))
        return undefined;
    const tagName = node.rawTagName?.toLowerCase();
    if (tagName === "plaintext")
        return null;
    const titleIgnoringContext = ignoredContext || (tagName ? TITLE_IGNORING_CONTEXTS.has(tagName) : false);
    if (tagName === "title" && !ignoredContext)
        return node.textContent.trim() || null;
    for (const child of node.childNodes) {
        const title = findTitle(child, titleIgnoringContext);
        if (title !== undefined)
            return title;
    }
    return undefined;
}
/** Extract the first applicable HTML title from a document. */
export function extractHtmlTitle(html) {
    return findTitle(parse(html), false) ?? null;
}
//# sourceMappingURL=html-metadata.js.map