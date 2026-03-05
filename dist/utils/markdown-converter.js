import { convert as kreuzbergConvert } from "@kreuzberg/html-to-markdown";
import { parse, HTMLElement as NHPHTMLElement } from "node-html-parser";
// --- Constants ---
// Preprocessing - Selectors for removal (balanced approach)
const PREPROCESSING_REMOVE_SELECTORS = [
    "script", // Remove all scripts, including JSON-LD
    "style",
    "noscript",
    "iframe:not([title])", // Keep iframes with titles (potential embeds)
    "svg", // Inline SVGs - decorative icons, bloat RAG with meaningless path data
    "img[src*='data:image/svg']", // Base64 inline SVG images
];
// Preprocessing - Selectors for identifying potential main content
const MAIN_CONTENT_SELECTORS = [
    // By semantics
    "article",
    "main",
    "[role='main']",
    "[role='article']",
    // By common class/id names (more robust patterns)
    "[class*='article-body']",
    "[class*='post-content']",
    "[class*='main-content']",
    "[class*='entry-content']",
    "[id*='article-body']",
    "[id*='main-content']",
    // Common CMS patterns
    ".article",
    ".post",
    ".content",
    ".entry",
    ".blog-post",
    // Fallback
    "body",
];
// Preprocessing - Selectors for forum detection
const FORUM_COMMENT_SELECTORS = [
    ".comment",
    ".comments",
    ".comtr",
    '[id^="comment-"]',
    'div[id^="c_"]',
];
const FORUM_THREAD_SELECTORS = [".thread", ".post", '[id^="thread-"]'];
const FORUM_VOTE_SELECTORS = [".vote", ".score", ".upvote", ".downvote", ".votelinks"];
const FORUM_MAIN_POST_SELECTORS = [".fatitem", ".submission", ".op", ".original-post"];
const FORUM_COMMENTS_CONTAINER_SELECTORS = [".comment-tree", ".comments", "#comments"];
const FORUM_OBVIOUS_NON_CONTENT_SELECTORS = ["header", "footer", ".nav", ".sidebar"];
// Preprocessing - Link Density
const MIN_LINK_DENSITY_TEXT_LENGTH = 50; // Lowered slightly from original
const DEFAULT_LINK_DENSITY_THRESHOLD = 0.4; // Slightly lower threshold
// Preprocessing - Forum Detection
const MIN_FORUM_INDICATOR_COUNT = 3;
// Postprocessing
const POSTPROCESSING_MAX_CONSECUTIVE_NEWLINES = 2; // Keep paragraphs separate
// --- Class Definition ---
export class MarkdownConverter {
    constructor() {
        // No initialization needed for Kreuzberg - it's stateless
    }
    /**
     * Converts HTML string to Markdown.
     * @param html The HTML string to convert.
     * @param options Conversion options.
     * @returns The converted Markdown string.
     */
    convert(html, options = {}) {
        // Preprocess HTML to clean and extract main content
        const preprocessedHtml = this.preprocessHTML(html);
        // Convert preprocessed HTML to Markdown using Kreuzberg (Rust-native)
        let markdown = kreuzbergConvert(preprocessedHtml, { headingStyle: "Atx" });
        // Post-process Markdown for cleanup
        markdown = this.postprocessMarkdown(markdown, options);
        return markdown;
    }
    // --- HTML Preprocessing ---
    preprocessHTML(html) {
        // This function performs multi-stage processing on the HTML string:
        // 1. Initial cleanup (regex-based).
        // 2. Parsing into a DOM tree.
        // 3. Removing specified elements (scripts, styles, etc.).
        // 4. Removing elements with high link density.
        // 5. Extracting document metadata.
        // 6. Detecting if the page is a forum.
        // 7. Extracting main article or forum content.
        // 8. Final cleanup of extracted content HTML.
        // The overall complexity is influenced by DOM traversals, querySelectorAll calls,
        // and text content access, potentially super-linear in the size of the HTML.
        try {
            html = this.cleanupHtml(html);
            const root = parse(html, {
                comment: false,
                blockTextElements: { script: true, style: true, noscript: true },
            });
            // Use nodeType check and cast via unknown
            if (root.nodeType === 3) {
                // Node.TEXT_NODE
                return root.textContent ?? "";
            }
            else if (root.nodeType !== 1) {
                // Node.ELEMENT_NODE
                console.warn("Unexpected root node type after parsing:", root.nodeType);
                return root.toString();
            }
            const rootElement = root;
            PREPROCESSING_REMOVE_SELECTORS.forEach((selector) => {
                try {
                    rootElement.querySelectorAll(selector).forEach((el) => el.remove());
                }
                catch (e) {
                    console.warn(`Skipping invalid selector during preprocessing: ${selector}`, e);
                }
            });
            // Remove img elements pointing to .svg URLs (decorative logos/icons; bloat RAG)
            this.removeSvgImageRefs(rootElement);
            // Remove breadcrumb UI blocks explicitly (often low link density)
            this.removeBreadcrumbs(rootElement);
            this.removeHighLinkDensityElements(rootElement, DEFAULT_LINK_DENSITY_THRESHOLD);
            const bestTitle = rootElement.querySelector("meta[property='og:title']")?.getAttribute("content") ??
                rootElement.querySelector("meta[name='twitter:title']")?.getAttribute("content") ??
                rootElement.querySelector("meta[name='DC.title']")?.getAttribute("content") ??
                rootElement.querySelector("title")?.textContent ??
                "";
            // Drop <head> from the DOM so we don't leak <title> etc. into content
            try {
                rootElement.querySelector("head")?.remove();
            }
            catch { }
            const isForum = this.detectForumPage(rootElement);
            let contentElement = rootElement;
            if (isForum) {
                contentElement = this.extractForumContentElement(rootElement);
            }
            else {
                try {
                    contentElement = this.extractArticleContentElement(rootElement);
                }
                catch (e) {
                    const message = e instanceof Error ? e.message : String(e);
                    console.error(`MarkdownConverter: Error during main content extraction, falling back to full body: ${message}`, e instanceof Error ? e : undefined);
                    // Fallback to the original root (full body) if extraction fails
                    const body = rootElement.querySelector("body");
                    contentElement = body || rootElement;
                }
            }
            // Ensure we don't include <head> if extraction returned <html>
            if (contentElement instanceof NHPHTMLElement && contentElement.tagName === "HTML") {
                const body = rootElement.querySelector("body");
                if (body)
                    contentElement = body;
            }
            // Ensure main page title is rendered as H1 in content
            this.ensurePrimaryHeading(rootElement, contentElement, bestTitle);
            let contentHtml = contentElement instanceof NHPHTMLElement ? contentElement.outerHTML : contentElement.textContent;
            contentHtml = this.cleanupContentHtml(contentHtml || "");
            return contentHtml;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`HTML preprocessing failed: ${message}`, error instanceof Error ? error : undefined);
            return this.cleanupHtml(html); // Return original (but cleaned) HTML on failure
        }
    }
    /** Remove img elements with .svg src (external SVG URLs). Inline SVG and data: URIs already stripped by PREPROCESSING_REMOVE_SELECTORS. */
    removeSvgImageRefs(root) {
        root.querySelectorAll("img[src]").forEach((el) => {
            const src = el.getAttribute("src") || "";
            if (src.toLowerCase().includes(".svg"))
                el.remove();
        });
    }
    // Remove common breadcrumb containers explicitly, regardless of link density
    removeBreadcrumbs(root) {
        const selectors = [
            "nav[aria-label='breadcrumb']",
            "nav[aria-label='Breadcrumb']",
            "[aria-label='breadcrumbs']",
            "[aria-label='Breadcrumbs']",
            "nav.breadcrumb",
            "nav.breadcrumbs",
            "ol.breadcrumb",
            "ul.breadcrumb",
            ".breadcrumb",
            ".breadcrumbs",
            "[itemtype*='Breadcrumb']",
            "[itemtype*='breadcrumb']",
            "[typeof*='BreadcrumbList']",
        ];
        for (const sel of selectors) {
            try {
                root.querySelectorAll(sel).forEach((el) => {
                    // Remove the element; if it's inside a <nav>, remove the nav container
                    const nav = el.closest && el.closest("nav");
                    (nav || el).remove();
                });
            }
            catch {
                // Ignore selector errors
            }
        }
    }
    /** Promote or inject a primary H1 heading using the provided title (from Kreuzberg metadata or DOM extraction). */
    ensurePrimaryHeading(_root, content, providedTitle) {
        if (!(content instanceof NHPHTMLElement))
            return;
        const normalize = (s) => (s || "").trim().replace(/\s+/g, " ");
        const titleNorm = normalize(providedTitle);
        const firstH1 = content.querySelector("h1");
        const firstHeading = content.querySelector("h1, h2, h3, h4, h5, h6");
        const h1Text = normalize(firstH1?.textContent || "");
        if (firstH1) {
            // If document title is longer and contains the existing H1, replace H1 with the document title
            if (titleNorm &&
                titleNorm.length > h1Text.length &&
                (titleNorm.includes(h1Text) || h1Text.includes(titleNorm.split("|")[0].trim()))) {
                firstH1.set_content(providedTitle ?? "");
            }
            return;
        }
        // No H1 present: prefer document title if available
        if (titleNorm) {
            const h1 = parse(`<h1>${providedTitle ?? ""}</h1>`).firstChild;
            content.prepend(h1);
            return;
        }
        // Otherwise, promote the first heading to H1
        if (firstHeading) {
            firstHeading.tagName = "H1";
        }
    }
    cleanupHtml(html) {
        // Remove specific non-standard characters/patterns observed in the wild
        return (html
            // Example pattern from original code
            .replace(/AMIL:\[=-,amilft[^\s]*/g, "")
            // Remove simple template variables like {{variable}} but not complex ones
            .replace(/\{\{\s*[^}\s]+\s*}}/g, "")
            // Remove control characters except for common whitespace (tab, newline, carriage return)
            .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ""));
    }
    cleanupContentHtml(content) {
        // Remove common SPA framework attributes after content extraction
        // Also remove comments that might have survived initial parse
        return (content
            // Remove specific data-* attributes that are often framework-specific noise
            .replace(/\s*data-(?:reactid|reactroot|react-|testid|v-|js-|qa-|cy-)[^=\s]*\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/g, "")
            // Remove Angular-specific attributes
            .replace(/\s*ng-[^=\s]*\s*=\s*(?:"[^"]*"|'[^']*'|\S+)/g, "")
            .replace(/\s*_ngcontent-[^\s]*\s*=""/g, "")
            .replace(/\s*class\s*=\s*"(ng-|mat-)[^"]*"/g, "") // Remove common Angular classes
            // Remove comment nodes explicitly
            .replace(/<!--[\s\S]*?-->/g, "")
            // Collapse multiple spaces/tabs within lines, but preserve newlines
            .replace(/([ \t])+/g, " ")
            // Trim whitespace around newlines
            .replace(/\s*\n\s*/g, "\n")
            .trim());
    }
    /** Check if any CSS class token matches exactly, or if any token contains the substring (for hyphenated classes like "article-body"). */
    hasClass(cls, exact) {
        return cls.split(/\s+/).some((token) => token === exact);
    }
    hasClassSubstring(cls, sub) {
        return cls.split(/\s+/).some((token) => token.includes(sub));
    }
    /** Check if element matches a main content selector (node-html-parser has no matches()). */
    elementMatchesMainContent(el) {
        const tag = el.tagName?.toLowerCase() || "";
        const role = (el.getAttribute?.("role") || "").toLowerCase();
        const cls = (el.getAttribute?.("class") || "").toLowerCase();
        const id = (el.getAttribute?.("id") || "").toLowerCase();
        if (tag === "body" || tag === "main" || tag === "article")
            return true;
        if (role === "main" || role === "article")
            return true;
        if (this.hasClassSubstring(cls, "article-body") ||
            this.hasClassSubstring(cls, "post-content") ||
            this.hasClassSubstring(cls, "main-content") ||
            this.hasClassSubstring(cls, "entry-content") ||
            this.hasClass(cls, "article") ||
            this.hasClass(cls, "post") ||
            this.hasClass(cls, "content") ||
            this.hasClass(cls, "entry") ||
            this.hasClass(cls, "blog-post"))
            return true;
        if (id.includes("article-body") || id.includes("main-content"))
            return true;
        return false;
    }
    /** Check if element matches boilerplate selectors (node-html-parser has no matches()). */
    elementMatchesBoilerplate(el) {
        const tag = el.tagName?.toLowerCase() || "";
        const role = (el.getAttribute?.("role") || "").toLowerCase();
        const cls = (el.getAttribute?.("class") || "").toLowerCase();
        if (["header", "footer", "nav", "aside"].includes(tag))
            return true;
        if (role === "navigation" || role === "complementary" || role === "banner")
            return true;
        if (this.hasClass(cls, "sidebar") ||
            this.hasClass(cls, "widget") ||
            this.hasClass(cls, "menu") ||
            this.hasClass(cls, "nav") ||
            this.hasClass(cls, "header") ||
            this.hasClass(cls, "footer"))
            return true;
        return false;
    }
    // Potentially performance-intensive: involves iterating over many elements
    // and performing sub-queries (querySelectorAll, textContent) for each.
    removeHighLinkDensityElements(element, threshold) {
        const potentialBoilerplate = element.querySelectorAll("div, nav, ul, aside, section, .sidebar, .widget, .menu, [role='navigation'], [role='menubar']");
        for (const el of Array.from(potentialBoilerplate)) {
            if (!(el instanceof NHPHTMLElement))
                continue;
            const textContent = el.textContent || "";
            if (textContent.length < MIN_LINK_DENSITY_TEXT_LENGTH)
                continue;
            const links = el.querySelectorAll("a");
            if (links.length < 3)
                continue; // Require a minimum number of links
            const textLength = textContent.length;
            // Calculate link text length more carefully - avoid double counting nested links
            let linkTextLength = 0;
            el.querySelectorAll("a").forEach((link) => {
                // Ensure link is a direct child or descendant not within another link
                if (link.closest("a") === link) {
                    linkTextLength += link.textContent?.length || 0;
                }
            });
            // Avoid division by zero
            if (textLength === 0)
                continue;
            const density = linkTextLength / textLength;
            if (density > threshold) {
                // Avoid removing the element if it contains a primary content marker
                const containsMainContent = el.querySelector('main, article, [role="main"], [role="article"]') !== null;
                // Also avoid removing if it IS the main content candidate itself
                const isMainContent = this.elementMatchesMainContent(el);
                if (!containsMainContent && !isMainContent) {
                    el.remove();
                }
            }
        }
    }
    detectForumPage(root) {
        // Count indicators across different selector groups
        const countMatches = (selectors) => {
            return selectors.reduce((count, selector) => {
                try {
                    // Check if element exists before querying within it
                    if (root) {
                        return count + root.querySelectorAll(selector).length;
                    }
                    return count;
                }
                catch (e) {
                    const message = e instanceof Error ? e.message : String(e);
                    console.warn(`MarkdownConverter: Invalid selector during forum detection: '${selector}'. Error: ${message}`);
                    return count;
                } // Ignore selector errors, but log a warning
            }, 0);
        };
        const commentCount = countMatches(FORUM_COMMENT_SELECTORS);
        const threadCount = countMatches(FORUM_THREAD_SELECTORS);
        const voteCount = countMatches(FORUM_VOTE_SELECTORS);
        // Check hostname for known forum patterns
        let isKnownForumHost = false;
        try {
            const canonicalUrl = root.querySelector('link[rel="canonical"]')?.getAttribute("href") ||
                root.querySelector('meta[property="og:url"]')?.getAttribute("content");
            if (canonicalUrl) {
                // Ensure the URL is absolute before parsing
                // Provide a dummy base URL in case the canonical URL is relative
                const absoluteUrl = new URL(canonicalUrl, "http://example.com").toString();
                const hostname = new URL(absoluteUrl).hostname.toLowerCase();
                isKnownForumHost =
                    hostname.includes("reddit.com") ||
                        hostname.includes("news.ycombinator.com") ||
                        hostname.includes("forum") ||
                        hostname.includes("discuss") ||
                        hostname.includes("community");
            }
        }
        catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.warn(`MarkdownConverter: Could not parse URL for forum detection. Error: ${message}`, e instanceof Error ? e : undefined);
        }
        // Decision logic: requires significant indicators or known host
        return (commentCount >= MIN_FORUM_INDICATOR_COUNT ||
            threadCount > 1 || // More than one thread item is stronger indicator
            voteCount >= MIN_FORUM_INDICATOR_COUNT ||
            isKnownForumHost);
    }
    /**
     * Calculates a score for a given HTML element to determine if it's likely the main content.
     * @param element The HTML element to score.
     * @param currentMaxScore The current maximum score found so far (used for body tag heuristic).
     * @returns The calculated score for the element.
     */
    // This scoring function is called for each candidate element during content extraction.
    // It involves text content access, querySelectorAll("p"), and elementMatchesBoilerplate()
    // (node-html-parser has no matches()), contributing to the overall complexity of extractArticleContentElement.
    _calculateElementScore(element, currentMaxScore) {
        // Basic scoring: text length
        const textLength = (element.textContent || "").trim().length;
        // Require some minimum length or presence of media to be considered
        // Using a constant for minimum length (e.g., MIN_CONTENT_TEXT_LENGTH = 100)
        const MIN_CONTENT_TEXT_LENGTH = 100; // Or define this at class/file level
        if (textLength < MIN_CONTENT_TEXT_LENGTH && !element.querySelector("img, video, iframe, figure")) {
            return -1; // Not a candidate if too short and no media
        }
        let score = textLength;
        // Boost common content tags/roles
        if (["ARTICLE", "MAIN"].includes(element.tagName))
            score *= 1.5;
        if (["main", "article"].includes(element.getAttribute("role") || ""))
            score *= 1.5;
        // Penalize common boilerplate containers/roles
        if (["HEADER", "FOOTER", "NAV", "ASIDE"].includes(element.tagName))
            score *= 0.3;
        if (this.elementMatchesBoilerplate(element))
            score *= 0.2;
        // Penalize if it contains high-link density elements that weren't removed
        // Using a constant for the threshold (e.g., HIGH_LINK_DENSITY_THRESHOLD_PENALTY = 0.6)
        const HIGH_LINK_DENSITY_THRESHOLD_PENALTY = 0.6;
        if (this.hasHighLinkDensity(element, HIGH_LINK_DENSITY_THRESHOLD_PENALTY)) {
            score *= 0.5;
        }
        // Boost if it contains multiple paragraph tags
        // Using a constant for min paragraphs (e.g., MIN_PARAGRAPHS_FOR_BOOST = 2)
        const MIN_PARAGRAPHS_FOR_BOOST = 2;
        if (element.querySelectorAll("p").length > MIN_PARAGRAPHS_FOR_BOOST)
            score *= 1.2;
        // Avoid selecting the entire body unless other scores are very low
        // Using a constant for body score threshold (e.g., BODY_SCORE_THRESHOLD = 200)
        const BODY_SCORE_THRESHOLD = 200;
        if (element.tagName === "BODY" && currentMaxScore > BODY_SCORE_THRESHOLD) {
            return -1; // Penalize body if better candidates already exist
        }
        return score;
    }
    // Tries to find the main content element for an article-like page.
    // Iterates through MAIN_CONTENT_SELECTORS, runs querySelectorAll for each,
    // then iterates through matched elements, calling _calculateElementScore.
    // Complexity depends on the number of selectors, matched elements, and the
    // cost of _calculateElementScore.
    extractArticleContentElement(root) {
        let bestCandidate = null;
        let maxScore = -1;
        // Evaluate candidates based on selectors, text length, and tag boosting/penalties
        for (const selector of MAIN_CONTENT_SELECTORS) {
            try {
                const elements = root.querySelectorAll(selector);
                for (const element of Array.from(elements)) {
                    if (!(element instanceof NHPHTMLElement))
                        continue;
                    const score = this._calculateElementScore(element, maxScore);
                    if (score > maxScore) {
                        maxScore = score;
                        bestCandidate = element;
                    }
                }
            }
            catch (e) {
                const message = e instanceof Error ? e.message : String(e);
                console.warn(`MarkdownConverter: Invalid selector '${selector}' in extractArticleContentElement. Error: ${message}`);
                // Ignore invalid selectors, but log a warning
            }
        }
        // Return the best candidate, or the root if nothing substantial found
        return bestCandidate || root;
    }
    // Tries to find the main content element(s) for a forum-like page.
    // Involves multiple querySelector calls for specific forum parts, cloning nodes (O(subtree size)),
    // and potentially a call to removeHighLinkDensityElements in the fallback case.
    // The complexity can be significant depending on DOM structure and the need for fallbacks.
    extractForumContentElement(root) {
        // For forums, combine the main post + comments container
        const tempContainer = parse("<div></div>").firstChild;
        // 1. Find and clone the main post/submission
        try {
            const mainPost = FORUM_MAIN_POST_SELECTORS.map((s) => root.querySelector(s)).find((el) => el instanceof NHPHTMLElement);
            if (mainPost) {
                tempContainer.appendChild(mainPost.clone());
            }
        }
        catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.warn(`MarkdownConverter: Error finding forum main post. Error: ${message}`, e instanceof Error ? e : undefined);
        }
        // 2. Find, clean, and clone the comments container
        try {
            const commentsContainer = FORUM_COMMENTS_CONTAINER_SELECTORS.map((s) => root.querySelector(s)).find((el) => el instanceof NHPHTMLElement);
            if (commentsContainer) {
                const clonedComments = commentsContainer.clone();
                if (clonedComments instanceof NHPHTMLElement) {
                    // Clean obvious non-content from the cloned comments section
                    FORUM_OBVIOUS_NON_CONTENT_SELECTORS.forEach((selector) => {
                        try {
                            clonedComments.querySelectorAll(selector).forEach((el) => el.remove());
                        }
                        catch (e) {
                            const message = e instanceof Error ? e.message : String(e);
                            console.warn(`MarkdownConverter: Error cleaning forum comments (selector: '${selector}'). Error: ${message}`, e instanceof Error ? e : undefined);
                        }
                    });
                    tempContainer.appendChild(clonedComments);
                }
            }
        }
        catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            console.warn(`MarkdownConverter: Error finding forum comments container. Error: ${message}`, e instanceof Error ? e : undefined);
        }
        // If we found specific parts, return the combined container
        if (tempContainer.childNodes.length > 0) {
            return tempContainer;
        }
        // Fallback: If no specific parts found, use the body after cleaning
        const body = root.querySelector("body");
        if (body) {
            const clonedBody = body.clone();
            if (clonedBody instanceof NHPHTMLElement) {
                FORUM_OBVIOUS_NON_CONTENT_SELECTORS.forEach((selector) => {
                    try {
                        clonedBody.querySelectorAll(selector).forEach((el) => el.remove());
                    }
                    catch (e) {
                        const message = e instanceof Error ? e.message : String(e);
                        console.warn(`MarkdownConverter: Error cleaning forum body fallback (selector: '${selector}'). Error: ${message}`, e instanceof Error ? e : undefined);
                    }
                });
                // Also remove high link density from body fallback
                this.removeHighLinkDensityElements(clonedBody, DEFAULT_LINK_DENSITY_THRESHOLD);
                return clonedBody;
            }
        }
        // Ultimate fallback: return the original root
        return root;
    }
    // Helper function to check link density within an element
    // Called by _calculateElementScore and removeHighLinkDensityElements.
    // Involves textContent access and querySelectorAll("a").
    hasHighLinkDensity(element, threshold) {
        const textContent = element.textContent || "";
        if (textContent.length < MIN_LINK_DENSITY_TEXT_LENGTH)
            return false;
        const links = element.querySelectorAll("a");
        if (links.length < 3)
            return false;
        const textLength = textContent.length;
        let linkTextLength = 0;
        element.querySelectorAll("a").forEach((link) => {
            // Ensure link is a direct child or descendant not within another link
            if (link.closest("a") === link) {
                linkTextLength += link.textContent?.length || 0;
            }
        });
        // Avoid division by zero
        if (textLength === 0)
            return false;
        return linkTextLength / textLength > threshold;
    }
    // --- Markdown Postprocessing ---
    postprocessMarkdown(markdown, options) {
        let processed = markdown;
        // 1. Fix heading spacing (ensure blank lines around headings)
        processed = processed.replace(/^(\s*\n)?(#{1,6}\s.*)$/gm, "\n\n$2\n\n");
        // 2. Fix list spacing (ensure blank line before list, compact items)
        processed = processed.replace(/^(\s*\n)?(([\*\-+>]|\d+\.)\s)/gm, (_match, _p1, p2) => `\n\n${p2}`); // Ensure blank line before first item
        // The following regex for compacting list items is temporarily commented out due to test failures indicating item concatenation.
        /*
        processed = processed.replace(
          /(\n([\*\-+]|\d+\.)\s(?:(?!\n\n|\n {2,}|\n\t)[\s\S])*?)\n(?=([\*\-+]|\d+\.)\s)/g,
          "$1"
        );
        */
        // 3. Remove empty Markdown elements (links, images)
        processed = processed.replace(/\[\]\([^)]*\)/g, ""); // Empty links: [](...)
        processed = processed.replace(/!\[\]\([^)]*\)/g, ""); // Empty images: ![](...)
        // 4. Normalize image/link URLs (ensure protocol) - Basic handling
        processed = processed.replace(/(!?\[[^\]]*\]\()(\/\/)/g, "$1https://"); // Fix protocol-relative URLs //
        // Root-relative URLs (/path/...) need base URL context which we don't have here.
        // 5. Normalize newlines (max 2 consecutive newlines)
        const maxNewlines = "\n".repeat(POSTPROCESSING_MAX_CONSECUTIVE_NEWLINES + 1);
        const newlineRegex = new RegExp(`${maxNewlines}+`, "g");
        processed = processed.replace(newlineRegex, "\n".repeat(POSTPROCESSING_MAX_CONSECUTIVE_NEWLINES));
        // 6. Clean extraneous whitespace
        processed = processed.replace(/^[ \t]+|[ \t]+$/gm, ""); // Trim leading/trailing space on lines
        // 7. Fix code block spacing (ensure blank lines around them)
        processed = processed.replace(/^(\s*\n)?(```(.*)\n[\s\S]*?\n```)(\s*\n)?/gm, "\n\n$2\n\n");
        // 8. Remove excessively repeated *lines* (simple check for duplication)
        // This regex identifies lines that are at least 30 characters long and are immediately repeated.
        // - `^(.{30,})$`: Captures a line of 30+ characters into group 1 (\1).
        // - `(\n\1)+`: Matches one or more occurrences of a newline followed by the exact content of group 1.
        // Replaces the entire match (original line + all its immediate repetitions) with just the original line ($1).
        processed = processed.replace(/^(.{30,})$(\n\1)+/gm, "$1");
        // 9. Tidy up metadata section (ensure spacing)
        processed = processed.replace(/(\n---\n)(\S)/g, "$1\n$2"); // Ensure blank line after separator
        // 10. Truncate to max length if specified
        if (options.maxContentLength && processed.length > options.maxContentLength) {
            // Try to truncate at a sentence boundary
            const truncatedPoint = processed.lastIndexOf(".", options.maxContentLength - 15); // Look back a bit
            const sliceEnd = truncatedPoint > options.maxContentLength / 2 ? truncatedPoint + 1 : options.maxContentLength;
            processed = processed.slice(0, sliceEnd) + "... (truncated)";
        }
        // 11. Final trim
        return processed.trim();
    }
}
//# sourceMappingURL=markdown-converter.js.map