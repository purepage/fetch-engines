export interface ConversionOptions {
    /** Maximum length of the final Markdown content. Defaults to Infinity. */
    maxContentLength?: number;
}
export declare class MarkdownConverter {
    private turndownService;
    constructor();
    /**
     * Converts HTML string to Markdown.
     * @param html The HTML string to convert.
     * @param options Conversion options.
     * @returns The converted Markdown string.
     */
    convert(html: string, options?: ConversionOptions): string;
    private setupPrioritizedRules;
    private addContentExtractionRules;
    private addStructureRules;
    private addBlockRules;
    private addInlineRules;
    private preprocessHTML;
    private cleanupHtml;
    private cleanupContentHtml;
    private removeHighLinkDensityElements;
    private extractDocumentMetadata;
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
}
//# sourceMappingURL=markdown-converter.d.ts.map