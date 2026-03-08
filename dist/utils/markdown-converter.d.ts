export interface ConversionOptions {
    /** Maximum length of the final Markdown content. Defaults to Infinity. */
    maxContentLength?: number;
    /** Base URL used to resolve relative href/src URLs into absolute URLs. */
    baseUrl?: string;
}
export declare class MarkdownConverter {
    constructor();
    /**
     * Converts HTML string to Markdown.
     * @param html The HTML string to convert.
     * @param options Conversion options.
     * @returns The converted Markdown string.
     */
    convert(html: string, options?: ConversionOptions): string;
    private preprocessHTML;
    /** Remove img elements with .svg src (external SVG URLs). Inline SVG and data: URIs already stripped by PREPROCESSING_REMOVE_SELECTORS. */
    private removeSvgImageRefs;
    private removeBreadcrumbs;
    private removeContentSubtreeBoilerplate;
    private removeHighLinkDensityElementsInSelectedContent;
    private absolutizeRelativeUrls;
    private resolveUrlAgainstBase;
    /** Promote or inject a primary H1 heading using the provided title (from Kreuzberg metadata or DOM extraction). */
    private ensurePrimaryHeading;
    private cleanupHtml;
    private cleanupContentHtml;
    /** Check if any CSS class token matches exactly, or if any token contains the substring (for hyphenated classes like "article-body"). */
    private hasClass;
    private hasClassSubstring;
    /** Check if element matches a main content selector (node-html-parser has no matches()). */
    private elementMatchesMainContent;
    /** Check if element matches boilerplate selectors (node-html-parser has no matches()). */
    private elementMatchesBoilerplate;
    private isWithinProtectedMainContent;
    private isLikelyConsentOrInterstitial;
    private removeHighLinkDensityElements;
    private findSemanticMainContent;
    private detectForumPage;
    /**
     * Calculates a score for a given HTML element to determine if it's likely the main content.
     * @param element The HTML element to score.
     * @param currentMaxScore The current maximum score found so far (used for body tag heuristic).
     * @returns The calculated score for the element.
     */
    private _calculateElementScore;
    private extractArticleContentElement;
    private extractForumContentElement;
    private hasHighLinkDensity;
    private postprocessMarkdown;
    private splitDenseAdjacentLinkRuns;
}
/** Insert a "Source: <url>" line immediately below the first H1 heading. */
export declare function injectSourceUrl(markdown: string, sourceUrl: string): string;
//# sourceMappingURL=markdown-converter.d.ts.map