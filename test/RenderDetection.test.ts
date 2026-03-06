import { describe, expect, it } from "vitest";
import {
  assessHtmlRenderNeed,
  assessSerializedContent,
  isRenderedContentMeaningfullyBetter,
} from "../src/utils/render-detection.js";

describe("render detection", () => {
  it("should classify an app shell as needing render", () => {
    const shellHtml = `<!doctype html>
      <html>
        <head>
          <title></title>
          <script type="module" src="/assets/app.js"></script>
          <script src="/assets/vendor.js"></script>
          <script src="/assets/runtime.js"></script>
        </head>
        <body>
          <div id="root"></div>
        </body>
      </html>`;

    const assessment = assessHtmlRenderNeed(shellHtml);

    expect(assessment.renderLikelyNeeded).toBe(true);
    expect(assessment.renderLikelyNeededScore).toBeGreaterThanOrEqual(4);
  });

  it("should classify a content-rich HTML page as not needing render", () => {
    const contentHtml = `<!doctype html>
      <html>
        <head>
          <title>Example article</title>
        </head>
        <body>
          <main>
            <article>
              <h1>Example article</h1>
              <p>This page already contains enough text to be useful without a browser render pass.</p>
              <p>It should not be treated as an empty application shell by default.</p>
            </article>
          </main>
        </body>
      </html>`;

    const assessment = assessHtmlRenderNeed(contentHtml);

    expect(assessment.renderLikelyNeeded).toBe(false);
    expect(assessment.qualityScore).toBeGreaterThan(0);
  });

  it("should prefer rendered content when it is materially better", () => {
    const baseline = assessSerializedContent('<html><head><title></title></head><body><div id="app"></div></body></html>', "html");
    const candidate = assessSerializedContent(
      "# Example article\n\nThis rendered content now includes the title and body text that were missing before.",
      "markdown"
    );

    expect(isRenderedContentMeaningfullyBetter(baseline, candidate)).toBe(true);
  });
});
