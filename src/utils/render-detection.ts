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

const ROOT_CONTAINER_REGEX = /<div[^>]+id=["']?(?:root|app)\b["']?[^>]*>\s*(?:<!--[\s\S]*?-->\s*)*<\/div>/i;
const HAS_ROOT_CONTAINER_REGEX = /<(?:div|main|section)[^>]+id=["']?(?:root|app)\b["']?[^>]*>/i;
const TITLE_REGEX = /<title[^>]*>([\s\S]*?)<\/title>/i;
const HEADING_REGEX = /<h[1-3][^>]*>/gi;
const MAIN_LIKE_REGEX = /<(?:main|article)[^>]*>/i;
const NOSCRIPT_ENABLE_JS_REGEX = /<noscript[\s\S]*?(enable javascript|requires javascript|javascript to run)/i;
const SCRIPT_TAG_REGEX = /<script\b/gi;

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function htmlEntityDecode(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripHtmlToVisibleText(html: string): string {
  return collapseWhitespace(
    htmlEntityDecode(
      html
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<[^>]+>/g, " ")
    )
  );
}

function stripMarkdownToVisibleText(markdown: string): string {
  return collapseWhitespace(
    markdown
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`]*`/g, " ")
      .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/[*_~>-]/g, " ")
  );
}

function scoreTextSignals(textLength: number, titleLength: number, hasMainLike: boolean, headingCount: number): number {
  let score = 0;
  score += Math.min(6, Math.floor(textLength / 120));
  score += Math.min(2, Math.floor(titleLength / 12));
  if (hasMainLike) score += 2;
  if (headingCount > 0) score += 1;
  return score;
}

export function assessHtmlRenderNeed(html: string): HtmlRenderAssessment {
  const htmlLength = html.length;
  const visibleText = stripHtmlToVisibleText(html);
  const visibleTextLength = visibleText.length;
  const titleMatch = html.match(TITLE_REGEX);
  const titleLength = collapseWhitespace(htmlEntityDecode(titleMatch?.[1] || "")).length;
  const scriptCount = (html.match(SCRIPT_TAG_REGEX) || []).length;
  const headingCount = (html.match(HEADING_REGEX) || []).length;
  const hasMainLike = MAIN_LIKE_REGEX.test(html);
  const hasRootContainer = HAS_ROOT_CONTAINER_REGEX.test(html);
  const hasEmptyRootContainer = ROOT_CONTAINER_REGEX.test(html);
  const hasNoscriptEnableJs = NOSCRIPT_ENABLE_JS_REGEX.test(html);

  let renderLikelyNeededScore = 0;
  if (titleLength === 0) renderLikelyNeededScore += 3;
  if (visibleTextLength < 80) renderLikelyNeededScore += 3;
  if (hasEmptyRootContainer) renderLikelyNeededScore += 3;
  if (hasNoscriptEnableJs) renderLikelyNeededScore += 2;
  if (htmlLength < 2000) renderLikelyNeededScore += 1;
  if (scriptCount >= 3 && visibleTextLength < 200) renderLikelyNeededScore += 1;
  if (hasRootContainer && visibleTextLength < 160) renderLikelyNeededScore += 1;
  if (!hasMainLike && headingCount === 0 && visibleTextLength < 120) renderLikelyNeededScore += 1;

  let qualityScore = scoreTextSignals(visibleTextLength, titleLength, hasMainLike, headingCount);
  if (hasEmptyRootContainer) qualityScore -= 3;
  if (titleLength === 0) qualityScore -= 2;
  if (visibleTextLength < 80) qualityScore -= 2;

  return {
    htmlLength,
    visibleTextLength,
    titleLength,
    scriptCount,
    headingCount,
    hasMainLike,
    hasRootContainer,
    hasEmptyRootContainer,
    hasNoscriptEnableJs,
    qualityScore,
    renderLikelyNeededScore,
    renderLikelyNeeded: renderLikelyNeededScore >= 4,
  };
}

export function assessSerializedContent(
  content: string,
  contentType: "html" | "markdown"
): SerializedContentAssessment {
  if (contentType === "html") {
    const assessment = assessHtmlRenderNeed(content);
    return {
      textLength: assessment.visibleTextLength,
      titleLength: assessment.titleLength,
      qualityScore: assessment.qualityScore,
    };
  }

  const visibleText = stripMarkdownToVisibleText(content);
  const firstHeadingMatch = content.match(/^#\s+(.+)$/m);
  const titleLength = collapseWhitespace(firstHeadingMatch?.[1] || "").length;

  return {
    textLength: visibleText.length,
    titleLength,
    qualityScore: scoreTextSignals(visibleText.length, titleLength, false, firstHeadingMatch ? 1 : 0),
  };
}

export function isRenderedContentMeaningfullyBetter(
  baseline: SerializedContentAssessment,
  candidate: SerializedContentAssessment
): boolean {
  if (candidate.qualityScore >= baseline.qualityScore + 2) return true;
  if (candidate.textLength >= Math.max(200, baseline.textLength * 2)) return true;
  if (candidate.titleLength > 0 && baseline.titleLength === 0 && candidate.textLength >= baseline.textLength)
    return true;
  return false;
}
