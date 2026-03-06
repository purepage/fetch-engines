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
export declare function assessSerializedContent(content: string, contentType: "html" | "markdown"): SerializedContentAssessment;
export declare function isRenderedContentMeaningfullyBetter(baseline: SerializedContentAssessment, candidate: SerializedContentAssessment): boolean;
//# sourceMappingURL=render-detection.d.ts.map