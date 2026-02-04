/**
 * Heuristic detection for SPA shells that render most content client-side.
 */
export function isLikelySpaShell(htmlContent: string): boolean {
  if (!htmlContent) return true;

  const trimmed = htmlContent.trim();

  if (trimmed.length < 150 && /<noscript>/i.test(trimmed)) return true;

  if (/<noscript>/i.test(htmlContent)) return true;

  if (/<div id=(?:"|')?(root|app)(?:"|')?[^>]*>\s*<\/div>/i.test(htmlContent)) return true;

  if (/<title>\s*<\/title>/i.test(htmlContent) || !/<title[^>]*>/i.test(htmlContent)) return true;

  return false;
}
