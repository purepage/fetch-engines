import { describe, expect, it } from "vitest";
import {
  assessHtmlRenderNeed,
  assessSerializedContent,
  isRenderedContentMeaningfullyBetter,
  isSoftBlockPage,
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

describe("isSoftBlockPage", () => {
  it("should detect a Cloudflare challenge page", () => {
    const html = `<!DOCTYPE html>
      <html><head><title>Just a moment...</title></head>
      <body>
        <div class="cf-challenge">
          <h2>Checking your browser before accessing the site.</h2>
          <p>This process is automatic. Your browser will redirect shortly.</p>
        </div>
        <script src="/cdn-cgi/challenge-platform/scripts/main.js"></script>
      </body></html>`;
    expect(isSoftBlockPage(html)).toBe(true);
  });

  it("should detect a CAPTCHA / verify-you-are-human page", () => {
    const html = `<!DOCTYPE html>
      <html><head><title>Security Check</title></head>
      <body>
        <h1>Verify you are human</h1>
        <div class="captcha-container">
          <p>Please complete the security check to access this site.</p>
        </div>
      </body></html>`;
    expect(isSoftBlockPage(html)).toBe(true);
  });

  it("should detect an access-denied soft block", () => {
    const html = `<!DOCTYPE html>
      <html><head><title>Access Denied</title></head>
      <body>
        <h1>You have been blocked</h1>
        <p>This website is using a security service to protect itself.</p>
      </body></html>`;
    expect(isSoftBlockPage(html)).toBe(true);
  });

  it("should detect a Turnstile challenge", () => {
    const html = `<!DOCTYPE html>
      <html><head><title>Please wait</title></head>
      <body>
        <div class="cf-turnstile"></div>
        <p>We need to verify that you are not a robot.</p>
      </body></html>`;
    expect(isSoftBlockPage(html)).toBe(true);
  });

  it("should NOT flag a genuine content page as a soft block", () => {
    const html = `<!DOCTYPE html>
      <html><head><title>Getting Started - My Framework</title></head>
      <body>
        <main>
          <h1>Getting Started</h1>
          <p>Welcome to the documentation. This guide will walk you through setting up your
             project from scratch, configuring the build system, adding plugins, and deploying
             to production. The framework provides a flexible architecture that scales from
             small prototypes to large enterprise applications.</p>
          <h2>Installation</h2>
          <p>Run npm install my-framework to get started. You can also use yarn or pnpm as
             your package manager. The minimum Node.js version required is 18.0.0.</p>
        </main>
      </body></html>`;
    expect(isSoftBlockPage(html)).toBe(false);
  });

  it("should NOT flag a content-heavy page even if it mentions verification in passing", () => {
    const longContent = Array(50)
      .fill("This is a paragraph of real content about software development and best practices.")
      .join(" ");
    const html = `<!DOCTYPE html>
      <html><head><title>My Blog Post</title></head>
      <body>
        <article>
          <h1>How to verify your deployment</h1>
          <p>${longContent}</p>
        </article>
      </body></html>`;
    expect(isSoftBlockPage(html)).toBe(false);
  });

  it("should NOT flag a partial-content paywall prompt as a soft block", () => {
    const html = `<!DOCTYPE html>
      <html><head><title>Investigating modern web scraping techniques</title></head>
      <body>
        <article>
          <h1>Investigating modern web scraping techniques</h1>
          <p>Web scraping has evolved from simple DOM extraction to hybrid rendering pipelines
             that balance cost, latency, and content completeness across static and dynamic pages.</p>
          <p>In this article we compare server-rendered sites, app shells, access-guarded
             properties, and documentation platforms with complex navigation structures.</p>
        </article>
        <section class="metered-paywall">
          <h2>Subscribe to continue reading</h2>
          <p>Create an account or sign in to access the full article.</p>
        </section>
      </body></html>`;
    expect(isSoftBlockPage(html)).toBe(false);
  });
});
