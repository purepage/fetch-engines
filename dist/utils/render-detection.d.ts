export interface HtmlRenderAssessment {
    htmlLength: number;
    visibleTextLength: number;
    titleLength: number;
    scriptCount: number;
    headingCount: number;
    hasMainLike: boolean;
    hasRootContainer: boolean;
    hasEmptyRootContainer: boolean;
    hasNoscriptEnableJs: boolean;
    qualityScore: number;
    renderLikelyNeededScore: number;
    renderLikelyNeeded: boolean;
}
export interface SerializedContentAssessment {
    textLength: number;
    titleLength: number;
    qualityScore: number;
}
export declare function assessHtmlRenderNeed(html: string): HtmlRenderAssessment;
/**
 * Detect if an HTTP response is a soft-block page (Cloudflare challenge, CAPTCHA,
 * "verify you're human", etc.) that looks like a real HTML document but contains no
 * actual page content.
 */
export declare function isSoftBlockPage(html: string): boolean;
export declare function assessSerializedContent(content: string, contentType: "html" | "markdown"): SerializedContentAssessment;
export declare function isRenderedContentMeaningfullyBetter(baseline: SerializedContentAssessment, candidate: SerializedContentAssessment): boolean;
//# sourceMappingURL=render-detection.d.ts.map