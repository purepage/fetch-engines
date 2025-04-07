import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { parse, HTMLElement as NHPHTMLElement, Node as NHPNode, TextNode as NHPTextNode } from "node-html-parser";

// --- Constants ---

// Preprocessing - Selectors for removal (balanced approach)
const PREPROCESSING_REMOVE_SELECTORS: ReadonlyArray<string> = [
  "script:not([type='application/ld+json'])", // Keep JSON-LD
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

// --- Types ---

export interface ConversionOptions {
  /** Maximum length of the final Markdown content. Defaults to Infinity. */
  maxContentLength?: number;
}

// Use DOM Node/HTMLElement types for Turndown rule signatures
type TurndownNode = Node; // Standard DOM Node
type TurndownHTMLElement = HTMLElement; // Standard DOM HTMLElement
type TurndownFilter = TurndownService.Filter;
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
      // Use Turndown's expected types for the callback
      keepReplacement: ((_content: string, node: TurndownNode) => {
        if (node instanceof window.HTMLElement) {
          const htmlElement = node as TurndownHTMLElement;
          if (htmlElement.getAttribute("role") === "presentation" || htmlElement.classList?.contains("preserve")) {
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
        if (!(node instanceof window.HTMLElement)) return false;
        const el = node as TurndownHTMLElement;
        return (
          el.tagName.toLowerCase() === "main" ||
          ["main", "article"].includes(el.getAttribute("role") || "") ||
          MAIN_CONTENT_SELECTORS.some((selector) => {
            try {
              return el.matches(selector) && selector !== "body";
            } catch {
              return false;
            }
          })
        ); // Check if it matches known content selectors
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
    this.turndownService.keep(["h1", "h2", "h3", "h4", "h5", "h6"]);
  }

  private addBlockRules(): void {
    // Lists (ensure proper nesting indentation)
    this.turndownService.addRule("list", {
      filter: ["ul", "ol"],
      replacement: (content: string, node: TurndownNode) => {
        if (!(node instanceof window.HTMLElement)) return content;
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
      // Use standard function for `this` context if needed, or ensure types match
      replacement: function (content: string, node: TurndownNode, options: TurndownService.Options) {
        content = content
          .replace(/^\s+/gm, "") // Remove leading whitespace from each line
          .replace(/\n(?!\s*$)/gm, "\n  "); // Indent subsequent lines correctly

        let prefix = options.bulletListMarker + " ";
        const parentNode = node.parentNode as TurndownHTMLElement | null;
        if (parentNode && parentNode.nodeName === "OL") {
          try {
            const start = parentNode.getAttribute("start");
            // Ensure node is an Element before accessing children/indexOf
            const elementNode = node as Element;
            const parentElement = parentNode as Element;
            const index = Array.prototype.indexOf.call(parentElement.children, elementNode);
            prefix = (start ? Number(start) + index : index + 1) + ". ";
          } catch (e) {
            console.warn("Could not determine ordered list index:", e);
            prefix = "1. "; // Fallback
          }
        }
        // Add newline only if needed (next sibling exists and current content doesn't end with newline)
        const trimmedContent = content.trim();
        return prefix + trimmedContent + (node.nextSibling && !/\n$/.test(trimmedContent) ? "\n" : "");
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
      filter: (node: TurndownNode): boolean =>
        node.nodeName === "A" &&
        !!(node instanceof window.HTMLElement) &&
        !!(node as TurndownHTMLElement).getAttribute("href"),
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
        } catch (e) {
          console.warn(`Failed to decode URI, keeping original: ${href}`, e);
          // Keep original href if decoding fails
        }

        return title ? `[${text}](${decodedHref} "${title}")` : `[${text}](${decodedHref})`;
      },
    });

    // Images - Handle figures and captions
    this.turndownService.addRule("figure", {
      filter: "figure",
      replacement: (content: string, node: TurndownNode) => {
        if (!(node instanceof window.HTMLElement)) return content;
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
      filter: (node: TurndownNode) => node.nodeName === "IMG" && node.parentNode?.nodeName !== "FIGURE",
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
        if (!(node instanceof window.HTMLElement)) return false;
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
        if (!(node instanceof window.HTMLElement)) return content.trim(); // Should be HTMLElement based on filter
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
    try {
      // 1. Basic Cleanup (Remove weird chars, template vars)
      html = this.cleanupHtml(html);

      // 2. Parse HTML
      const root = parse(html, {
        comment: false, // Remove comments during parsing
        blockTextElements: {
          script: true, // Keep content of script tags (for JSON-LD)
          style: true, // Keep content of style tags (though removed later)
          noscript: true,
        },
      });
      // Use NHPHTMLElement for node-html-parser specific operations
      if (!(root instanceof NHPHTMLElement)) {
        return root.textContent || "";
      }

      // 3. Remove clearly unwanted elements (now including style)
      PREPROCESSING_REMOVE_SELECTORS.forEach((selector) => {
        try {
          root.querySelectorAll(selector).forEach((el) => el.remove());
        } catch (e) {
          console.warn(`Skipping invalid selector during preprocessing: ${selector}`, e);
        }
      });

      // 4. Remove high link density areas (potential nav/ads/boilerplate)
      this.removeHighLinkDensityElements(root, DEFAULT_LINK_DENSITY_THRESHOLD);

      // 5. Extract Metadata (before potentially altering structure further)
      const metadata = this.extractDocumentMetadata(root);

      // 6. Detect if it looks like a forum page
      const isForum = this.detectForumPage(root);

      // 7. Extract main content based on page type
      let contentElement: NHPHTMLElement | NHPNode = root; // Default to root
      if (isForum) {
        contentElement = this.extractForumContentElement(root);
      } else {
        contentElement = this.extractArticleContentElement(root);
      }

      // 8. Get the HTML of the extracted content element
      // Use outerHTML for elements, textContent otherwise
      let contentHtml =
        contentElement instanceof NHPHTMLElement ? contentElement.outerHTML : contentElement.textContent;

      // 9. Final content cleanup (SPA attributes etc.) on the extracted HTML
      contentHtml = this.cleanupContentHtml(contentHtml || ""); // Pass empty string if null

      // 10. Prepend metadata
      // Ensure metadata is joined correctly and separated from content
      const metadataString = metadata.length > 0 ? metadata.join("\n\n") + "\n\n---\n\n" : "";

      return metadataString + contentHtml;
    } catch (error) {
      console.error("HTML preprocessing failed:", error);
      // Fallback to basic cleanup if full preprocessing fails
      return this.cleanupHtml(html);
    }
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

  private removeHighLinkDensityElements(element: NHPHTMLElement, threshold: number): void {
    // Target common container elements that might hold boilerplate nav/menus
    // Include explicit role attributes commonly used for nav/menus
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
            return el.matches(selector);
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

  private extractDocumentMetadata(root: NHPHTMLElement): string[] {
    const metadata: string[] = [];
    const addedMeta: Set<string> = new Set(); // Track added keys to avoid duplicates

    // Helper to add metadata if value exists and key hasn't been added
    const addMeta = (key: string, value: string | null | undefined, isTitle = false) => {
      const cleanedValue = value?.trim();
      if (cleanedValue && !addedMeta.has(key.toLowerCase())) {
        if (isTitle) {
          metadata.unshift(`# ${cleanedValue}`); // Main title as H1 at the beginning
        } else {
          metadata.push(`**${key}:** ${cleanedValue}`);
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
          } catch (e) {
            // Ignore invalid JSON
            return null;
          }
        })
        .filter((item): item is object => item !== null); // Type guard for filter

      if (jsonLdData.length > 0 && !addedMeta.has("json-ld")) {
        // Use details/summary for collapsibility
        metadata.push("<details><summary>JSON-LD Metadata</summary>\n");
        metadata.push("```json", JSON.stringify(jsonLdData, null, 2), "```");
        metadata.push("</details>");
        addedMeta.add("json-ld");
      }
    }

    return metadata;
  }

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
        } catch {
          return count;
        } // Ignore selector errors
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
    } catch (e) {
      console.warn("Could not parse URL for forum detection:", e);
    }

    // Decision logic: requires significant indicators or known host
    return (
      commentCount >= MIN_FORUM_INDICATOR_COUNT ||
      threadCount > 1 || // More than one thread item is stronger indicator
      voteCount >= MIN_FORUM_INDICATOR_COUNT ||
      isKnownForumHost
    );
  }

  // Tries to find the main content element for an article-like page
  private extractArticleContentElement(root: NHPHTMLElement): NHPHTMLElement | NHPNode {
    let bestCandidate: NHPHTMLElement | null = null;
    let maxScore = -1;

    // Evaluate candidates based on selectors, text length, and tag boosting/penalties
    for (const selector of MAIN_CONTENT_SELECTORS) {
      try {
        const elements = root.querySelectorAll(selector);
        for (const element of Array.from(elements)) {
          if (!(element instanceof NHPHTMLElement)) continue;

          // Basic scoring: text length
          const textLength = (element.textContent || "").trim().length;
          // Require some minimum length or presence of media to be considered
          if (textLength < 100 && !element.querySelector("img, video, iframe, figure")) continue;

          let score = textLength;

          // Boost common content tags/roles
          if (["ARTICLE", "MAIN"].includes(element.tagName)) score *= 1.5;
          if (["main", "article"].includes(element.getAttribute("role") || "")) score *= 1.5;

          // Penalize common boilerplate containers/roles
          if (["HEADER", "FOOTER", "NAV", "ASIDE"].includes(element.tagName)) score *= 0.3;
          if (
            element.matches(
              '.sidebar, .widget, .menu, .nav, .header, .footer, [role="navigation"], [role="complementary"], [role="banner"]'
            )
          )
            score *= 0.2;

          // Penalize if it contains high-link density elements that weren't removed
          if (this.hasHighLinkDensity(element, 0.6)) {
            // Use a slightly higher threshold here
            score *= 0.5;
          }

          // Boost if it contains multiple paragraph tags
          if (element.querySelectorAll("p").length > 2) score *= 1.2;

          // Avoid selecting the entire body unless other scores are very low
          if (element.tagName === "BODY" && maxScore > 200) continue;

          if (score > maxScore) {
            maxScore = score;
            bestCandidate = element;
          }
        }
      } catch (e) {
        // Ignore invalid selectors
      }
    }

    // Return the best candidate, or the root if nothing substantial found
    return bestCandidate || root;
  }

  // Tries to find the main content element(s) for a forum-like page
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
    } catch (e) {
      console.warn("Error finding forum main post:", e);
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
            } catch {
              /* ignore */
            }
          });
          tempContainer.appendChild(clonedComments);
        }
      }
    } catch (e) {
      console.warn("Error finding forum comments container:", e);
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
          } catch {
            /* ignore */
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
    // Remove single newlines *between* simple list items of the same type unless followed by indented block
    processed = processed.replace(
      /(\n([\*\-+]|\d+\.)\s(?:(?!\n\n|\n {2,}|\n\t)[\s\S])*?)\n(?=([\*\-+]|\d+\.)\s)/g,
      "$1"
    );

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
