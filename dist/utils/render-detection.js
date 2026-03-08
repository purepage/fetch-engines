const ROOT_CONTAINER_REGEX = /<div[^>]+id=["']?(?:root|app)\b["']?[^>]*>\s*(?:<!--[\s\S]*?-->\s*)*<\/div>/i;
const HAS_ROOT_CONTAINER_REGEX = /<(?:div|main|section)[^>]+id=["']?(?:root|app)\b["']?[^>]*>/i;
const TITLE_REGEX = /<title[^>]*>([\s\S]*?)<\/title>/i;
const HEADING_REGEX = /<h[1-3][^>]*>/gi;
const MAIN_LIKE_REGEX = /<(?:main|article)[^>]*>/i;
const NOSCRIPT_ENABLE_JS_REGEX = /<noscript[\s\S]*?(enable javascript|requires javascript|javascript to run)/i;
const SCRIPT_TAG_REGEX = /<script\b/gi;
// Soft-block / challenge page detection
const SOFT_BLOCK_TITLE_REGEX = /just a moment|attention required|access denied|please wait|one more step|checking your browser|security check|you have been blocked|blocked by|are you a robot/i;
const SOFT_BLOCK_BODY_REGEX = /checking your browser|verify you.{0,10}(?:are |'re )?(?:not a )?(?:ro)?bot|verify you.{0,10}human|please complete the security check|cf-challenge|captcha-container|hcaptcha|recaptcha|cf-turnstile|enable (?:javascript|cookies) to (?:continue|access|view)|automated (?:access|request)|bot detect|suspicious activity|unusual traffic|too many requests|rate limit exceeded|we need to verify/i;
function collapseWhitespace(value) {
    return value.replace(/\s+/g, " ").trim();
}
function htmlEntityDecode(value) {
    return value
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'");
}
function stripHtmlToVisibleText(html) {
    return collapseWhitespace(htmlEntityDecode(html
        .replace(/<!--[\s\S]*?-->/g, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<svg[\s\S]*?<\/svg>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<[^>]+>/g, " ")));
}
function stripMarkdownToVisibleText(markdown) {
    return collapseWhitespace(markdown
        .replace(/```[\s\S]*?```/g, " ")
        .replace(/`[^`]*`/g, " ")
        .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
        .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/[*_~>-]/g, " "));
}
function scoreTextSignals(textLength, titleLength, hasMainLike, headingCount) {
    let score = 0;
    score += Math.min(6, Math.floor(textLength / 120));
    score += Math.min(2, Math.floor(titleLength / 12));
    if (hasMainLike)
        score += 2;
    if (headingCount > 0)
        score += 1;
    return score;
}
export function assessHtmlRenderNeed(html) {
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
    if (titleLength === 0)
        renderLikelyNeededScore += 3;
    if (visibleTextLength < 80)
        renderLikelyNeededScore += 3;
    if (hasEmptyRootContainer)
        renderLikelyNeededScore += 3;
    if (hasNoscriptEnableJs)
        renderLikelyNeededScore += 2;
    if (htmlLength < 2000)
        renderLikelyNeededScore += 1;
    if (scriptCount >= 3 && visibleTextLength < 200)
        renderLikelyNeededScore += 1;
    if (hasRootContainer && visibleTextLength < 160)
        renderLikelyNeededScore += 1;
    if (!hasMainLike && headingCount === 0 && visibleTextLength < 120)
        renderLikelyNeededScore += 1;
    let qualityScore = scoreTextSignals(visibleTextLength, titleLength, hasMainLike, headingCount);
    if (hasEmptyRootContainer)
        qualityScore -= 3;
    if (titleLength === 0)
        qualityScore -= 2;
    if (visibleTextLength < 80)
        qualityScore -= 2;
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
/**
 * Detect if an HTTP response is a soft-block page (Cloudflare challenge, CAPTCHA,
 * "verify you're human", etc.) that looks like a real HTML document but contains no
 * actual page content.
 */
export function isSoftBlockPage(html) {
    const visibleText = stripHtmlToVisibleText(html);
    // Genuine content pages produce substantial text; soft blocks rarely exceed ~1500 visible chars.
    if (visibleText.length > 1500)
        return false;
    const titleMatch = html.match(TITLE_REGEX);
    const title = titleMatch?.[1] || "";
    if (SOFT_BLOCK_TITLE_REGEX.test(title))
        return true;
    return SOFT_BLOCK_BODY_REGEX.test(html);
}
export function assessSerializedContent(content, contentType) {
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
export function isRenderedContentMeaningfullyBetter(baseline, candidate) {
    if (candidate.qualityScore >= baseline.qualityScore + 2)
        return true;
    if (candidate.textLength >= Math.max(200, baseline.textLength * 2))
        return true;
    if (candidate.titleLength > 0 && baseline.titleLength === 0 && candidate.textLength >= baseline.textLength)
        return true;
    return false;
}
//# sourceMappingURL=render-detection.js.map