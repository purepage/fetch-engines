import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { parse, HTMLElement as NHPHTMLElement, Node as NHPNode, TextNode as NHPTextNode } from "node-html-parser";

// --- Constants ---

// Preprocessing - Selectors for removal (balanced approach)
const PREPROCESSING_REMOVE_SELECTORS: ReadonlyArray<string> = [
  "script", // Remove all scripts, including JSON-LD
  "style",
  "noscript",
  "iframe:not([title])", // Keep iframes with titles (potential embeds)
];

// Preprocessing - Selectors for identifying potential main content
const MAIN_CONTENT_SELECTORS: ReadonlyArray<string> = [
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
const FORUM_COMMENT_SELECTORS: ReadonlyArray<string> = [
  ".comment",
  ".comments",
  ".comtr",
  '[id^="comment-"]',
  'div[id^="c_"]',
];
const FORUM_THREAD_SELECTORS: ReadonlyArray<string> = [".thread", ".post", '[id^="thread-"]'];
const FORUM_VOTE_SELECTORS: ReadonlyArray<string> = [".vote", ".score", ".upvote", ".downvote", ".votelinks"];
const FORUM_MAIN_POST_SELECTORS: ReadonlyArray<string> = [".fatitem", ".submission", ".op", ".original-post"];
const FORUM_COMMENTS_CONTAINER_SELECTORS: ReadonlyArray<string> = [".comment-tree", ".comments", "#comments"];
const FORUM_OBVIOUS_NON_CONTENT_SELECTORS: ReadonlyArray<string> = ["header", "footer", ".nav", ".sidebar"];

// Preprocessing - Link Density
const MIN_LINK_DENSITY_TEXT_LENGTH = 50; // Lowered slightly from original
const DEFAULT_LINK_DENSITY_THRESHOLD = 0.4; // Slightly lower threshold

// Preprocessing - Forum Detection
const MIN_FORUM_INDICATOR_COUNT = 3;

// Turndown - Code block detection
const CODE_BLOCK_LANG_PREFIXES: ReadonlyArray<string> = ["language-", "lang-"];

// Postprocessing
const POSTPROCESSING_MAX_CONSECUTIVE_NEWLINES = 2; // Keep paragraphs separate

// Turndown specific
const DEFAULT_ORDERED_LIST_ITEM_PREFIX = "1. ";
const TURNDOWN_NODE_ELEMENT_TYPE = 1;
const TURNDOWN_PRESENTATION_ROLE = "presentation";
const TURNDOWN_PRESERVE_CLASS = "preserve";

// --- Types ---

export interface ConversionOptions {
  /** Maximum length of the final Markdown content. Defaults to Infinity. */
  maxContentLength?: number;
}

// Use DOM Node/HTMLElement types for Turndown rule signatures
type TurndownNode = Node; // Standard DOM Node
type TurndownHTMLElement = HTMLElement; // Standard DOM HTMLElement
type TurndownReplacementFunction = TurndownService.ReplacementFunction;

// --- Class Definition ---

export class MarkdownConverter {
  private turndownService: TurndownService;

  constructor() {
    this.turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
      strongDelimiter: "**",
      emDelimiter: "*",
      hr: "---",
      // Use nodeType check instead of window.HTMLElement
      // Important: Do NOT blanket-preserve <table> elements here — let the GFM plugin
      // convert them to Markdown. Only preserve explicitly marked layout/preserved elements.
      keepReplacement: ((_content: string, node: TurndownNode) => {
        // Node.ELEMENT_NODE is 1
        if (node.nodeType === TURNDOWN_NODE_ELEMENT_TYPE) {
          const htmlElement = node as TurndownHTMLElement;
          const role = htmlElement.getAttribute("role");
          const preserve = htmlElement.classList?.contains(TURNDOWN_PRESERVE_CLASS);
          if (role === TURNDOWN_PRESENTATION_ROLE || preserve) {
            return htmlElement.outerHTML;
          }
        }
        return "";
      }) as TurndownReplacementFunction,
    });

    this.turndownService.use(gfm);

    // Setup conversion rules
    this.setupPrioritizedRules();
  }

  // --- Public Method ---

  /**
   * Converts HTML string to Markdown.
   * @param html The HTML string to convert.
   * @param options Conversion options.
   * @returns The converted Markdown string.
   */
  public convert(html: string, options: ConversionOptions = {}): string {
    // Preprocess HTML to clean and extract main content
    const preprocessedHtml = this.preprocessHTML(html);

    // Convert preprocessed HTML to Markdown
    let markdown = this.turndownService.turndown(preprocessedHtml);

    // Post-process Markdown for cleanup
    markdown = this.postprocessMarkdown(markdown, options);

    return markdown;
  }

  // --- Turndown Rule Setup ---

  private setupPrioritizedRules(): void {
    this.addContentExtractionRules();
    this.addStructureRules();
    this.addBlockRules();
    this.addInlineRules();
  }

  // We rely on preprocessing to remove nav/menus/high-link-density areas.
  // These rules primarily help Turndown understand the *structure* of the *intended* content.
  private addContentExtractionRules(): void {
    this.turndownService.addRule("main-content-marker", {
      filter: (node: TurndownNode): boolean => {
        // Node.ELEMENT_NODE is 1
        if (node.nodeType !== TURNDOWN_NODE_ELEMENT_TYPE) return false;
        const el = node as TurndownHTMLElement;
        const element = node as Element;
        return (
          el.tagName.toLowerCase() === "main" ||
          ["main", "article"].includes(el.getAttribute("role") || "") ||
          MAIN_CONTENT_SELECTORS.some((selector) => {
            try {
              return element.matches(selector) && selector !== "body";
            } catch {
              return false;
            }
          })
        );
      },
      // Just pass content through, this rule is mainly for filter priority/debugging
      replacement: (content: string) => content,
    });

    // Explicitly remove elements that should definitely not be in Markdown
    const unwantedTags: Array<keyof HTMLElementTagNameMap> = [
      "script",
      "style",
      "noscript",
      "iframe",
      "button",
      "input",
      "select",
      "textarea",
      "form",
      "canvas",
      /*'svg' removed */ "audio",
      "video",
    ];
    this.turndownService.addRule("remove-unwanted", {
      filter: unwantedTags,
      replacement: () => "",
    });
  }

  private addStructureRules(): void {
    // Article structure (less critical now preprocessing extracts content)
    this.turndownService.addRule("article", {
      filter: "article",
      replacement: (content: string) => `\n\n${content}\n\n`, // Add separation
    });

    // Section structure (less critical now preprocessing extracts content)
    this.turndownService.addRule("section", {
      filter: "section",
      replacement: (content: string) => `\n\n${content}\n\n`, // Add separation
    });

    // Preserve heading levels correctly
    // this.turndownService.keep(["h1", "h2", "h3", "h4", "h5", "h6"]); // REMOVED - Use default ATX headings
  }

  private addBlockRules(): void {
    // Lists (ensure proper nesting indentation)
    this.turndownService.addRule("list", {
      filter: ["ul", "ol"],
      replacement: (content: string, node: TurndownNode) => {
        // Node.ELEMENT_NODE is 1
        if (node.nodeType !== TURNDOWN_NODE_ELEMENT_TYPE) return content;
        // Check if the parent is a list item (nested list)
        const parent = node.parentNode;
        const indent = parent && parent.nodeName.toLowerCase() === "li" ? "  " : "";
        // Ensure content is handled line by line for indentation
        // Trim trailing spaces from each line before joining
        return (
          "\n" +
          content
            .split("\n")
            .map((line) => indent + line.trimEnd())
            .join("\n")
            .trim() +
          "\n"
        );
      },
    });

    // List items
    this.turndownService.addRule("listItem", {
      filter: "li",
      // Use arrow function for consistency, as 'this' is not used.
      replacement: (content: string, node: TurndownNode, options: TurndownService.Options) => {
        content = content
          .replace(/^\s+/gm, "") // Remove leading whitespace from each line
          .replace(/\n(?!\s*$)/gm, "\n  "); // Indent subsequent lines correctly

        let prefix = options.bulletListMarker + " ";
        const parentNode = node.parentNode as TurndownHTMLElement | null;
        if (parentNode && parentNode.nodeName === "OL") {
          try {
            const start = parentNode.getAttribute("start");
            const elementNode = node as Element;
            const parentElement = parentNode as Element;
            const index = Array.prototype.indexOf.call(parentElement.children, elementNode);
            prefix = (start ? Number(start) + index : index + 1) + ". ";
          } catch (e: unknown) {
            prefix = DEFAULT_ORDERED_LIST_ITEM_PREFIX;
            const message = e instanceof Error ? e.message : String(e);
            console.warn(
              `MarkdownConverter: Error processing OL start attribute or LI index: ${message}`,
              e instanceof Error ? e : undefined
            );
          }
        }

        return prefix + content.trim() + "\n"; // Add newline after each item
      },
    });

    // Tables - Relying on GFM plugin

    // Blockquotes
    this.turndownService.addRule("blockquote", {
      filter: "blockquote",
      replacement: (content: string) => {
        // Trim leading/trailing newlines from content and add > prefix correctly
        const trimmedContent = content.trim();
        return "\n\n> " + trimmedContent.replace(/\n/g, "\n> ") + "\n\n";
      },
    });
  }

  private addInlineRules(): void {
    // Links - Ensure proper formatting and title preservation
    this.turndownService.addRule("link", {
      filter: (node: TurndownNode, _options: TurndownService.Options): boolean => {
        // Check nodeType and nodeName first, then cast for getAttribute
        return node.nodeType === 1 && node.nodeName === "A" && !!(node as TurndownHTMLElement).getAttribute("href");
      },
      replacement: (content: string, node: TurndownNode) => {
        const element = node as TurndownHTMLElement;
        const href = element.getAttribute("href") || "";
        const title = element.getAttribute("title");
        // Use content if available and not just whitespace, otherwise use href as text
        const text = content.trim() ? content.trim() : href;

        // Decode URI components, handling potential errors
        let decodedHref = href;
        try {
          // Decode only if it looks like it might be encoded
          if (href.includes("%")) {
            decodedHref = decodeURI(href);
          }
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          console.warn(
            `Failed to decode URI '${href}': ${message}. Keeping original.`,
            e instanceof Error ? e : undefined
          );
          // Keep original href if decoding fails
        }

        return title ? `[${text}](${decodedHref} \"${title}\")` : `[${text}](${decodedHref})`;
      },
    });

    // Images - Handle figures and captions
    this.turndownService.addRule("figure", {
      filter: "figure",
      replacement: (content: string, node: TurndownNode) => {
        // Node.ELEMENT_NODE is 1
        if (node.nodeType !== 1) return content;
        const element = node as TurndownHTMLElement;
        // Use DOM methods on the casted element
        const img = element.querySelector("img");
        const figcaption = element.querySelector("figcaption");

        let markdown = "";
        let mainImgMd = "";

        if (img) {
          const src = img.getAttribute("src") || "";
          const alt = img.getAttribute("alt") || "";
          const title = img.getAttribute("title");
          mainImgMd = title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`;
        }

        // Process the original content provided by Turndown (handles nested elements)
        let processedContent = content.trim();

        // If the figure primarily contains the image and caption, structure around the image
        if (mainImgMd) {
          markdown = mainImgMd;
          // Remove the image representation from the processed content if Turndown included it
          // Use a simple placeholder to avoid issues with special chars in alt/src
          const imgPlaceholder = `![${img?.getAttribute("alt") || ""}](${img?.getAttribute("src") || ""})`;
          processedContent = processedContent.replace(imgPlaceholder, "").trim();
        }

        if (figcaption) {
          const captionText = figcaption.textContent?.trim();
          if (captionText) {
            markdown += `\n\n_${captionText}_`; // Use italics for caption below the image
            // Remove the caption representation from the processed content
            processedContent = processedContent.replace(captionText, "").trim();
            processedContent = processedContent.replace(/^_+|_+$/g, "").trim(); // Remove surrounding underscores if any
          }
        }

        // Append any remaining content from the figure
        if (processedContent) {
          // Avoid adding just empty placeholders or insignificant content
          if (processedContent.length > 10 || /[a-zA-Z0-9]/.test(processedContent)) {
            markdown += `\n\n${processedContent}`;
          }
        }

        return "\n\n" + markdown.trim() + "\n\n";
      },
    });

    // Standalone Images (not in figures)
    this.turndownService.addRule("image", {
      filter: (node: TurndownNode): boolean => {
        // Node.ELEMENT_NODE is 1, it's an IMG, and has src
        return node.nodeType === 1 && node.nodeName === "IMG" && !!(node as TurndownHTMLElement).getAttribute("src");
      },
      replacement: (_content: string, node: TurndownNode) => {
        const element = node as TurndownHTMLElement;
        const src = element.getAttribute("src") || "";
        const alt = element.getAttribute("alt") || "";
        const title = element.getAttribute("title");
        // Add surrounding newlines for block display
        return title ? `\n\n![${alt}](${src} "${title}")\n\n` : `\n\n![${alt}](${src})\n\n`;
      },
    });

    // Code Blocks - Enhanced detection
    this.turndownService.addRule("code-block", {
      filter: (node: TurndownNode): boolean => {
        // Node.ELEMENT_NODE is 1
        if (node.nodeType !== 1) return false;
        const element = node as TurndownHTMLElement;

        // Must be a <pre> tag
        const isPre = element.tagName.toLowerCase() === "pre";
        if (!isPre) return false;

        // Consider it code if it has a <code> child or specific classes/attributes
        const hasCodeChild = element.querySelector("code") !== null;
        const hasCodeClass = /highlight|syntax|code|listing|source/i.test(element.className);
        const hasLangAttribute = !!element.getAttribute("lang") || !!element.getAttribute("language");

        return hasCodeChild || hasCodeClass || hasLangAttribute;
      },
      replacement: (content: string, node: TurndownNode) => {
        // Node.ELEMENT_NODE is 1
        if (node.nodeType !== 1) return content.trim(); // Should be ELEMENT_NODE based on filter
        const element = node as TurndownHTMLElement;

        // Detect language
        let language = "";
        const codeElement = element.querySelector("code");

        // 1. Check attributes on <pre> or <code>
        language =
          element.getAttribute("lang") ||
          element.getAttribute("language") ||
          (codeElement ? codeElement.getAttribute("lang") || codeElement.getAttribute("language") : "") ||
          "";

        // 2. Check for "language-*" or "lang-*" class
        if (!language) {
          const classes = (element.className + " " + (codeElement?.className || "")).split(" ").filter(Boolean);
          for (const cls of classes) {
            for (const prefix of CODE_BLOCK_LANG_PREFIXES) {
              if (cls.startsWith(prefix)) {
                language = cls.substring(prefix.length);
                break;
              }
            }
            if (language) break;
          }
        }

        // Clean up content - remove leading/trailing newlines often added
        const cleanedContent = content.trim();

        // Format code block
        return `\n\n\`\`\`${language}\n${cleanedContent}\n\`\`\`\n\n`;
      },
    });

    // Inline Code
    this.turndownService.addRule("inlineCode", {
      filter: (node: TurndownNode) => node.nodeName === "CODE" && node.parentNode?.nodeName !== "PRE",
      replacement: (content: string) => {
        // Ensure content is trimmed and handle potential backticks inside
        const trimmed = content.trim();
        if (!trimmed) return ""; // Don't render empty code tags

        // Determine delimiter based on content
        let delimiter = "`";
        if (trimmed.includes("`")) {
          delimiter = "``";
          // If content starts or ends with backtick, add space when using ``
          if (trimmed.startsWith("`") || trimmed.endsWith("`")) {
            return `${delimiter} ${trimmed} ${delimiter}`;
          }
        }
        return delimiter + trimmed + delimiter;
      },
    });
  }

  // --- HTML Preprocessing ---

  private preprocessHTML(html: string): string {
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
        return (root as unknown as NHPTextNode).textContent ?? "";
      } else if (root.nodeType !== 1) {
        // Node.ELEMENT_NODE
        console.warn("Unexpected root node type after parsing:", root.nodeType);
        return root.toString();
      }

      const rootElement = root as NHPHTMLElement;

      PREPROCESSING_REMOVE_SELECTORS.forEach((selector) => {
        try {
          rootElement.querySelectorAll(selector).forEach((el) => el.remove());
        } catch (e) {
          console.warn(`Skipping invalid selector during preprocessing: ${selector}`, e);
        }
      });

      // Remove breadcrumb UI blocks explicitly (often low link density)
      this.removeBreadcrumbs(rootElement);

      this.removeHighLinkDensityElements(rootElement, DEFAULT_LINK_DENSITY_THRESHOLD);
      // Normalize simple data tables so GFM can convert them (e.g., first row headers using <td>)
      this.normalizeTablesForMarkdown(rootElement);
      // Capture best title BEFORE removing head
      const bestTitle =
        rootElement.querySelector("meta[property='og:title']")?.getAttribute("content") ||
        rootElement.querySelector("meta[name='twitter:title']")?.getAttribute("content") ||
        rootElement.querySelector("meta[name='DC.title']")?.getAttribute("content") ||
        rootElement.querySelector("title")?.textContent ||
        "";
      // Drop <head> from the DOM so we don't leak <title> etc. into content
      try {
        rootElement.querySelector("head")?.remove();
      } catch {}
      const isForum = this.detectForumPage(rootElement);

      let contentElement: NHPHTMLElement | NHPNode = rootElement;
      if (isForum) {
        contentElement = this.extractForumContentElement(rootElement);
      } else {
        try {
          contentElement = this.extractArticleContentElement(rootElement);
        } catch (e: unknown) {
          const message = e instanceof Error ? e.message : String(e);
          console.error(
            `MarkdownConverter: Error during main content extraction, falling back to full body: ${message}`,
            e instanceof Error ? e : undefined
          );
          // Fallback to the original root (full body) if extraction fails
          const body = rootElement.querySelector("body");
          contentElement = (body as unknown as NHPHTMLElement) || rootElement;
        }
      }

      // Ensure we don't include <head> if extraction returned <html>
      if (contentElement instanceof NHPHTMLElement && (contentElement as NHPHTMLElement).tagName === "HTML") {
        const body = rootElement.querySelector("body");
        if (body) contentElement = body as unknown as NHPHTMLElement;
      }

      // Ensure main page title is rendered as H1 in content
      this.ensurePrimaryHeading(rootElement, contentElement, bestTitle);

      let contentHtml =
        contentElement instanceof NHPHTMLElement ? contentElement.outerHTML : contentElement.textContent;
      contentHtml = this.cleanupContentHtml(contentHtml || "");
      return contentHtml;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`HTML preprocessing failed: ${message}`, error instanceof Error ? error : undefined);
      return this.cleanupHtml(html); // Return original (but cleaned) HTML on failure
    }
  }

  /**
   * Ensures simple data tables are convertible to GFM by promoting the first row to headers
   * when no <th> exists. Skips layout tables marked with role="presentation".
   */
  private normalizeTablesForMarkdown(root: NHPHTMLElement): void {
    const tables = root.querySelectorAll("table");
    for (const table of tables) {
      if (!(table instanceof NHPHTMLElement)) continue;
      const role = table.getAttribute("role");
      if (role && role.toLowerCase() === "presentation") continue; // skip layout tables
      // Lossy-flatten complex tables to be GFM-compatible (best-effort). If flattening
      // fails (unexpected markup), fall back to preserving the original.
      const hasSpans = table.querySelector("[colspan], [rowspan]") !== null;
      if (hasSpans) {
        const ok = this.flattenTableToSimpleGfm(table);
        if (!ok) {
          const existing = table.getAttribute("class");
          const newClass = existing ? `${existing} ${TURNDOWN_PRESERVE_CLASS}` : TURNDOWN_PRESERVE_CLASS;
          table.setAttribute("class", newClass);
        }
        continue;
      }
      // If table already has headers, leave as-is
      if (table.querySelector("th")) continue;
      const firstRow = table.querySelector("tr");
      if (!firstRow || !(firstRow instanceof NHPHTMLElement)) continue;
      // Promote all cells in the first row to header cells
      const cells = firstRow.querySelectorAll("td");
      if (!cells || cells.length === 0) continue;
      for (const cell of cells) {
        if (cell instanceof NHPHTMLElement && cell.tagName === "TD") {
          // Switch tag to TH so GFM plugin recognizes header row
          // node-html-parser allows mutating tagName directly
          (cell as unknown as { tagName: string }).tagName = "TH";
        }
      }
    }
  }

  // Remove common breadcrumb containers explicitly, regardless of link density
  private removeBreadcrumbs(root: NHPHTMLElement): void {
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
      } catch (e) {
        // Ignore selector errors
      }
    }
  }

  // Render metadata items to HTML so Turndown can convert cleanly to Markdown
  // (metadata rendering removed – we no longer inject metadata into output)

  // Promote or inject a primary H1 heading using best available title.
  private ensurePrimaryHeading(root: NHPHTMLElement, content: NHPHTMLElement | NHPNode, providedTitle?: string): void {
    if (!(content instanceof NHPHTMLElement)) return;
    // Determine best title from metadata sources
    const bestTitle =
      providedTitle ||
      root.querySelector("meta[property='og:title']")?.getAttribute("content") ||
      root.querySelector("meta[name='twitter:title']")?.getAttribute("content") ||
      root.querySelector("meta[name='DC.title']")?.getAttribute("content") ||
      root.querySelector("title")?.textContent ||
      "";

    // Find existing headings in content
    const firstH1 = content.querySelector("h1");
    const firstHeading = content.querySelector("h1, h2, h3, h4, h5, h6") as NHPHTMLElement | null;

    const normalize = (s: string | null | undefined) => (s || "").trim().replace(/\s+/g, " ");
    const titleNorm = normalize(bestTitle);
    const h1Text = normalize(firstH1?.textContent || "");

    if (firstH1) {
      // If document title is longer and contains the existing H1, replace H1 with the document title
      if (
        titleNorm &&
        titleNorm.length > h1Text.length &&
        (titleNorm.includes(h1Text) || h1Text.includes(titleNorm.split("|")[0].trim()))
      ) {
        firstH1.set_content(bestTitle);
      }
      return;
    }

    // No H1 present: prefer document title if available
    if (titleNorm) {
      const h1 = parse(`<h1>${bestTitle}</h1>`).firstChild as NHPHTMLElement;
      content.prepend(h1);
      return;
    }

    // Otherwise, promote the first heading to H1
    if (firstHeading) {
      (firstHeading as unknown as { tagName: string }).tagName = "H1";
    }
  }

  // Attempt to flatten a table with colspans/rowspans into a simple table
  // with no spans so GFM can convert it. Returns true on success.
  private flattenTableToSimpleGfm(table: NHPHTMLElement): boolean {
    try {
      const rows = table.querySelectorAll("tr");
      if (!rows || rows.length === 0) return false;

      type SpanCell = { content: string; remaining: number };
      let spanMap: Record<number, SpanCell> = {};
      const grid: string[][] = [];
      let maxCols = 0;

      for (const tr of rows) {
        if (!(tr instanceof NHPHTMLElement)) continue;
        // Pre-fill from active rowspans
        const nextSpanMap: Record<number, SpanCell> = {};
        const currentRow: string[] = [];
        // Place carried-over cells first
        const spanCols = Object.keys(spanMap)
          .map((k) => Number(k))
          .sort((a, b) => a - b);
        for (const colIdx of spanCols) {
          const sc = spanMap[colIdx];
          currentRow[colIdx] = sc.content;
          if (sc.remaining - 1 > 0) {
            nextSpanMap[colIdx] = { content: sc.content, remaining: sc.remaining - 1 };
          }
        }

        // Place actual cells of the row, respecting existing occupied columns
        const cells = tr.querySelectorAll("th, td");
        let insertCol = 0;
        for (const cell of cells) {
          if (!(cell instanceof NHPHTMLElement)) continue;
          // Find next free column
          while (currentRow[insertCol] !== undefined) insertCol++;
          const colSpan = Math.max(1, parseInt(cell.getAttribute("colspan") || "1", 10) || 1);
          const rowSpan = Math.max(1, parseInt(cell.getAttribute("rowspan") || "1", 10) || 1);
          const content = this.sanitizeCellContentForTable(cell.innerHTML || "");
          for (let i = 0; i < colSpan; i++) {
            const col = insertCol + i;
            currentRow[col] = content;
            if (rowSpan > 1) {
              const existing = nextSpanMap[col];
              nextSpanMap[col] = { content, remaining: Math.max(existing?.remaining || 0, rowSpan - 1) };
            }
          }
          insertCol += colSpan;
        }

        // Normalize row
        const length = currentRow.length;
        maxCols = Math.max(maxCols, length);
        grid.push(currentRow);
        spanMap = nextSpanMap;
      }

      // Drop leading fully-empty rows (often style-only)
      while (grid.length && grid[0].every((c) => !c || !c.trim())) {
        grid.shift();
      }

      // Ensure all rows have equal length
      for (const row of grid) {
        for (let i = 0; i < maxCols; i++) {
          if (row[i] === undefined) row[i] = "";
        }
      }

      // Pick a header row: first non-empty row (after dropping empties)
      const headerRowIndex = 0;

      // Build a simple table HTML without spans
      let html = "<table><tbody>";
      for (let r = 0; r < grid.length; r++) {
        const row = grid[r];
        html += "<tr>";
        for (const cellContent of row) {
          if (r === headerRowIndex) {
            html += `<th>${cellContent}</th>`;
          } else {
            html += `<td>${cellContent}</td>`;
          }
        }
        html += "</tr>";
      }
      html += "</tbody></table>";

      // Replace original table with the flattened one
      const replacementRoot = parse(html);
      const newTable = replacementRoot.querySelector("table");
      if (!newTable) return false;
      table.replaceWith(newTable);
      return true;
    } catch {
      return false;
    }
  }

  // Reduce blocky/complex markup inside table cells to inline-friendly HTML so Turndown
  // does not break the table structure. Joins list items with " | ", removes outer divs,
  // flattens paragraphs and <br> to spaces, and trims whitespace.
  private sanitizeCellContentForTable(content: string): string {
    if (!content) return "";
    let c = content;
    // Normalize lists: turn <li> items into inline separated values
    c = c.replace(/<li[^>]*>/gi, "").replace(/<\/li>/gi, " • ");
    c = c.replace(/<\/(ul|ol)>/gi, "").replace(/<(ul|ol)[^>]*>/gi, "");
    // Remove outer div/span wrappers but keep inner content
    c = c.replace(/<div[^>]*>/gi, "").replace(/<\/div>/gi, " ");
    c = c.replace(/<span[^>]*>/gi, "").replace(/<\/span>/gi, "");
    // Flatten paragraphs and line breaks
    c = c.replace(/<p[^>]*>/gi, "").replace(/<\/p>/gi, " ");
    c = c.replace(/<br\s*\/?>(\s*)/gi, " ");
    // Normalize bullet separators spacing
    c = c.replace(/\s*•\s*/g, " • ");
    c = c.replace(/(\s*•\s*)+$/g, "");
    // Avoid Markdown table column separators inside cells
    c = c.replace(/\|/g, " • ");
    // Collapse multiple whitespace and trim
    c = c.replace(/\s+/g, " ").trim();
    return c;
  }

  private cleanupHtml(html: string): string {
    // Remove specific non-standard characters/patterns observed in the wild
    return (
      html
        // Example pattern from original code
        .replace(/AMIL:\[=-,amilft[^\s]*/g, "")
        // Remove simple template variables like {{variable}} but not complex ones
        .replace(/\{\{\s*[^}\s]+\s*}}/g, "")
        // Remove control characters except for common whitespace (tab, newline, carriage return)
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    );
  }

  private cleanupContentHtml(content: string): string {
    // Remove common SPA framework attributes after content extraction
    // Also remove comments that might have survived initial parse
    return (
      content
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
        .trim()
    );
  }

  // Potentially performance-intensive: involves iterating over many elements
  // and performing sub-queries (querySelectorAll, textContent) for each.
  // Complexity can be roughly O(B * (T_avg + L_avg * S_avg + M_avg)) where B is number of
  // boilerplate candidates, T_avg is avg cost of textContent, L_avg is avg links per candidate,
  // S_avg is avg cost of link text access, M_avg is avg cost of matches().
  private removeHighLinkDensityElements(element: NHPHTMLElement, threshold: number): void {
    const potentialBoilerplate = element.querySelectorAll(
      "div, nav, ul, aside, section, .sidebar, .widget, .menu, [role='navigation'], [role='menubar']"
    );

    for (const el of Array.from(potentialBoilerplate)) {
      if (!(el instanceof NHPHTMLElement)) continue;

      const textContent = el.textContent || "";
      if (textContent.length < MIN_LINK_DENSITY_TEXT_LENGTH) continue;

      const links = el.querySelectorAll("a");
      if (links.length < 3) continue; // Require a minimum number of links

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
      if (textLength === 0) continue;

      const density = linkTextLength / textLength;

      if (density > threshold) {
        // Avoid removing the element if it contains a primary content marker
        const containsMainContent = el.querySelector('main, article, [role="main"], [role="article"]') !== null;
        // Also avoid removing if it IS the main content candidate itself
        const isMainContent = MAIN_CONTENT_SELECTORS.some((selector) => {
          try {
            // Explicitly assert type before calling matches
            /* @ts-expect-error TODO: fix this */
            return (el as NHPHTMLElement).matches(selector);
          } catch {
            return false;
          }
        });

        if (!containsMainContent && !isMainContent) {
          el.remove();
        }
      }
    }
  }

  /*
  private extractDocumentMetadata(root: NHPHTMLElement): string[] {
    const metadata: string[] = [];
    const addedMeta: Set<string> = new Set(); // Track added keys to avoid duplicates

    // Helper to add metadata if value exists and key hasn't been added
    const addMeta = (key: string, value: string | null | undefined, isTitle = false) => {
      const cleanedValue = value?.trim();
      if (cleanedValue && !addedMeta.has(key.toLowerCase())) {
        // Skip injecting title as Markdown to avoid duplicating content H1
        if (!isTitle) {
          metadata.push(`${key}: ${cleanedValue}`);
        }
        addedMeta.add(key.toLowerCase());
      }
    };

    // 1. Title (Prioritize specific ones, fallback to <title>)
    addMeta("Title", root.querySelector("meta[property='og:title']")?.getAttribute("content"), true);
    addMeta("Title", root.querySelector("meta[name='twitter:title']")?.getAttribute("content"), true);
    addMeta("Title", root.querySelector("meta[name='DC.title']")?.getAttribute("content"), true);
    addMeta("Title", root.querySelector("title")?.textContent, true);

    // 2. Description
    addMeta("Description", root.querySelector("meta[property='og:description']")?.getAttribute("content"));
    addMeta("Description", root.querySelector("meta[name='twitter:description']")?.getAttribute("content"));
    addMeta("Description", root.querySelector("meta[name='description']")?.getAttribute("content"));
    addMeta("Description", root.querySelector("meta[name='DC.description']")?.getAttribute("content"));

    // 3. Author
    addMeta("Author", root.querySelector("meta[name='author']")?.getAttribute("content"));
    addMeta("Author", root.querySelector("meta[property='article:author']")?.getAttribute("content"));
    addMeta("Author", root.querySelector("[rel='author']")?.textContent);

    // 4. Publication Date
    addMeta("Published", root.querySelector("meta[property='article:published_time']")?.getAttribute("content"));
    addMeta("Published", root.querySelector("meta[name='publish-date']")?.getAttribute("content"));
    addMeta("Published", root.querySelector("time[itemprop='datePublished']")?.getAttribute("datetime"));
    addMeta("Published", root.querySelector("time")?.getAttribute("datetime")); // Generic time tag

    // 5. Canonical URL
    addMeta("URL", root.querySelector("link[rel='canonical']")?.getAttribute("href"));
    addMeta("URL", root.querySelector("meta[property='og:url']")?.getAttribute("content"));

    // 6. Extract JSON-LD
    const jsonLdScripts = root.querySelectorAll("script[type='application/ld+json']");
    if (jsonLdScripts.length > 0) {
      const jsonLdData = Array.from(jsonLdScripts)
        .map((script) => {
          try {
            // Ensure script content exists before parsing
            const textContent = script.textContent;
            return textContent ? JSON.parse(textContent) : null;
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            console.warn(`Failed to parse JSON-LD content: ${message}`, e instanceof Error ? e : undefined);
            return null;
          }
        })
        .filter((item): item is object => item !== null); // Type guard for filter

      if (jsonLdData.length > 0 && !addedMeta.has("json-ld")) {
        // Keep JSON-LD as a single block; will be injected as HTML later
        metadata.push(`<details><summary>JSON-LD Metadata</summary>\n<pre><code class="language-json">${
          JSON.stringify(jsonLdData, null, 2)
        }</code></pre>\n</details>`);
        addedMeta.add("json-ld");

        // Add other relevant fields like 'author', 'datePublished', etc.
        jsonLdData.forEach((jsonData) => {
          if (typeof jsonData === "object" && jsonData !== null) {
            // Safely extract publisher name from JSON-LD object
            const publisher = (jsonData as Record<string, unknown>).publisher as unknown;
            let orgName: string | undefined;
            if (publisher && typeof publisher === "object") {
              const name = (publisher as Record<string, unknown>).name;
              if (typeof name === "string") {
                orgName = name;
              }
            } else if (typeof publisher === "string") {
              orgName = publisher; // Some JSON-LD use a string for publisher
            }
            addMeta("Organization", orgName);
          }
        });
      }
    }

    return metadata;
  }
  */

  private detectForumPage(root: NHPHTMLElement): boolean {
    // Count indicators across different selector groups
    const countMatches = (selectors: ReadonlyArray<string>): number => {
      return selectors.reduce((count, selector) => {
        try {
          // Check if element exists before querying within it
          if (root) {
            return count + root.querySelectorAll(selector).length;
          }
          return count;
        } catch (e: unknown) {
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
      const canonicalUrl =
        root.querySelector('link[rel="canonical"]')?.getAttribute("href") ||
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
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(
        `MarkdownConverter: Could not parse URL for forum detection. Error: ${message}`,
        e instanceof Error ? e : undefined
      );
    }

    // Decision logic: requires significant indicators or known host
    return (
      commentCount >= MIN_FORUM_INDICATOR_COUNT ||
      threadCount > 1 || // More than one thread item is stronger indicator
      voteCount >= MIN_FORUM_INDICATOR_COUNT ||
      isKnownForumHost
    );
  }

  /**
   * Calculates a score for a given HTML element to determine if it's likely the main content.
   * @param element The HTML element to score.
   * @param currentMaxScore The current maximum score found so far (used for body tag heuristic).
   * @returns The calculated score for the element.
   */
  // This scoring function is called for each candidate element during content extraction.
  // It involves text content access, querySelectorAll("p"), and potentially element.matches(),
  // contributing to the overall complexity of extractArticleContentElement.
  private _calculateElementScore(element: NHPHTMLElement, currentMaxScore: number): number {
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
    if (["ARTICLE", "MAIN"].includes(element.tagName)) score *= 1.5;
    if (["main", "article"].includes(element.getAttribute("role") || "")) score *= 1.5;

    // Penalize common boilerplate containers/roles
    if (["HEADER", "FOOTER", "NAV", "ASIDE"].includes(element.tagName)) score *= 0.3;
    try {
      const classList = element.classList || [];
      const role = element.getAttribute("role") || "";
      const BOILERPLATE_CLASSES = [
        "sidebar",
        "widget",
        "menu",
        "nav",
        "header",
        "footer",
      ];
      const BOILERPLATE_ROLES = [
        "navigation",
        "complementary",
        "banner",
      ];

      if (
        BOILERPLATE_CLASSES.some((cls) => classList.contains?.(cls)) ||
        BOILERPLATE_ROLES.includes(role)
      ) {
        score *= 0.2;
      } else if (typeof (element as unknown as { matches?: (s: string) => boolean }).matches === "function") {
        const BOILERPLATE_SELECTORS_FOR_PENALTY =
          '.sidebar, .widget, .menu, .nav, .header, .footer, [role="navigation"], [role="complementary"], [role="banner"]';
        if (
          (element as unknown as { matches: (s: string) => boolean }).matches(
            BOILERPLATE_SELECTORS_FOR_PENALTY,
          )
        ) {
          score *= 0.2;
        }
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(`MarkdownConverter: Error matching selector in _calculateElementScore: ${message}`);
      /* Ignore selector match errors, but log a warning */
    }

    // Penalize if it contains high-link density elements that weren't removed
    // Using a constant for the threshold (e.g., HIGH_LINK_DENSITY_THRESHOLD_PENALTY = 0.6)
    const HIGH_LINK_DENSITY_THRESHOLD_PENALTY = 0.6;
    if (this.hasHighLinkDensity(element, HIGH_LINK_DENSITY_THRESHOLD_PENALTY)) {
      score *= 0.5;
    }

    // Boost if it contains multiple paragraph tags
    // Using a constant for min paragraphs (e.g., MIN_PARAGRAPHS_FOR_BOOST = 2)
    const MIN_PARAGRAPHS_FOR_BOOST = 2;
    if (element.querySelectorAll("p").length > MIN_PARAGRAPHS_FOR_BOOST) score *= 1.2;

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
  private extractArticleContentElement(root: NHPHTMLElement): NHPHTMLElement | NHPNode {
    let bestCandidate: NHPHTMLElement | null = null;
    let maxScore = -1;

    // Evaluate candidates based on selectors, text length, and tag boosting/penalties
    for (const selector of MAIN_CONTENT_SELECTORS) {
      try {
        const elements = root.querySelectorAll(selector);
        for (const element of Array.from(elements)) {
          if (!(element instanceof NHPHTMLElement)) continue;

          const score = this._calculateElementScore(element, maxScore);

          if (score > maxScore) {
            maxScore = score;
            bestCandidate = element;
          }
        }
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : String(e);
        console.warn(
          `MarkdownConverter: Invalid selector '${selector}' in extractArticleContentElement. Error: ${message}`
        );
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
  private extractForumContentElement(root: NHPHTMLElement): NHPHTMLElement | NHPNode {
    // For forums, combine the main post + comments container
    const tempContainer = parse("<div></div>").firstChild as NHPHTMLElement;

    // 1. Find and clone the main post/submission
    try {
      const mainPost = FORUM_MAIN_POST_SELECTORS.map((s) => root.querySelector(s)).find(
        (el) => el instanceof NHPHTMLElement
      ) as NHPHTMLElement | null;

      if (mainPost) {
        tempContainer.appendChild(mainPost.clone());
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(
        `MarkdownConverter: Error finding forum main post. Error: ${message}`,
        e instanceof Error ? e : undefined
      );
    }

    // 2. Find, clean, and clone the comments container
    try {
      const commentsContainer = FORUM_COMMENTS_CONTAINER_SELECTORS.map((s) => root.querySelector(s)).find(
        (el) => el instanceof NHPHTMLElement
      ) as NHPHTMLElement | null;

      if (commentsContainer) {
        const clonedComments = commentsContainer.clone();
        if (clonedComments instanceof NHPHTMLElement) {
          // Clean obvious non-content from the cloned comments section
          FORUM_OBVIOUS_NON_CONTENT_SELECTORS.forEach((selector) => {
            try {
              clonedComments.querySelectorAll(selector).forEach((el) => el.remove());
            } catch (e: unknown) {
              const message = e instanceof Error ? e.message : String(e);
              console.warn(
                `MarkdownConverter: Error cleaning forum comments (selector: '${selector}'). Error: ${message}`,
                e instanceof Error ? e : undefined
              );
            }
          });
          tempContainer.appendChild(clonedComments);
        }
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn(
        `MarkdownConverter: Error finding forum comments container. Error: ${message}`,
        e instanceof Error ? e : undefined
      );
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
          } catch (e: unknown) {
            const message = e instanceof Error ? e.message : String(e);
            console.warn(
              `MarkdownConverter: Error cleaning forum body fallback (selector: '${selector}'). Error: ${message}`,
              e instanceof Error ? e : undefined
            );
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
  private hasHighLinkDensity(element: NHPHTMLElement, threshold: number): boolean {
    const textContent = element.textContent || "";
    if (textContent.length < MIN_LINK_DENSITY_TEXT_LENGTH) return false;

    const links = element.querySelectorAll("a");
    if (links.length < 3) return false;

    const textLength = textContent.length;
    let linkTextLength = 0;
    element.querySelectorAll("a").forEach((link) => {
      // Ensure link is a direct child or descendant not within another link
      if (link.closest("a") === link) {
        linkTextLength += link.textContent?.length || 0;
      }
    });

    // Avoid division by zero
    if (textLength === 0) return false;

    return linkTextLength / textLength > threshold;
  }

  // --- Markdown Postprocessing ---

  private postprocessMarkdown(markdown: string, options: ConversionOptions): string {
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
