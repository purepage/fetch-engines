import { describe, it, expect } from "vitest";
import { MarkdownConverter } from "../src/utils/markdown-converter.js";

describe("MarkdownConverter", () => {
  it("converts tables without explicit header rows to GFM with promoted headers", () => {
    const html = `<table>
<tbody>
<tr>
<td><strong>Position</strong></td>
<td><strong>Weekly Pay Rate</strong></td>
<td><strong>Plus 16% Superannuation</strong></td>
<td><strong>Total Weekly Remuneration*</strong></td>
</tr>
<tr>
<td>Apprentice - under 18 years^</td>
<td>$722.16</td>
<td>$115.55</td>
<td>$837.71</td>
</tr>
</tbody>
</table>`;
    const converter = new MarkdownConverter();
    const markdown = converter.convert(html);
    // Should not preserve raw HTML table anymore
    expect(markdown).not.toContain("<table>");
    // Should include a GFM table header row
    expect(markdown).toContain("| **Position** | **Weekly Pay Rate**");
    // Should include data row content
    expect(markdown).toContain("Apprentice - under 18 years^");
  });

  it("prefers semantic main content over cookie and navigation chrome", () => {
    const html = `
      <body>
        <div id="cookies" class="content">
          <p>By continuing your navigation on this website, you accept the use of cookies for statistical purposes.</p>
          <button>Manage preferences</button>
          <button>Refuse all</button>
          <button>Agree to all</button>
        </div>
        <nav class="content">
          <a href="/login">Account / Login</a>
        </nav>
        <main>
          <div id="item" class="content threeColumns">
            <div class="middle">
              <div class="title">
                <h1><span><a href="/artist/romar">Romar</a></span></h1>
                <h2>Harmonie Ephémère EP</h2>
              </div>
              <div class="specs">
                <p><span><a href="/label/rora">RORA </a>(RORA005)</span></p>
                <div class="formats"><span>1x Vinyl</span><span>12"</span><span>EP</span></div>
                <div class="styles">
                  <a href="/genre/electronic">Electronic</a>
                  <a href="/style/tech-house">Tech House</a>
                  <a href="/style/minimal">Minimal</a>
                </div>
                <p>Release date: 11 Jun 2013<a href="/country/switzerland">, Switzerland</a></p>
              </div>
            </div>
            <div class="right">
              <div class="buyButton itemButton available">
                <span class="price">$32</span>
                <span>Add to basket</span>
                <div class="option media"><span class="media">Media: </span><span class="value">Very Good Plus (VG+)</span></div>
              </div>
            </div>
          </div>
        </main>
      </body>`;

    const converter = new MarkdownConverter();
    const markdown = converter.convert(html);

    expect(markdown).toContain("Romar");
    expect(markdown).toContain("Harmonie Ephémère EP");
    expect(markdown).toContain("Add to basket");
    expect(markdown).not.toContain("Manage preferences");
    expect(markdown).not.toContain("Account / Login");
  });

  it("removes nav and footer even when nested inside the selected main content container", () => {
    const html = `
      <body>
        <main>
          <nav>
            <a href="/products">Browse products</a>
            <a href="/about">About</a>
          </nav>
          <article>
            <h1>Primed flatsheets & weatherboards - Shingles/Rubix</h1>
            <p>Upfront Carbon Emissions</p>
            <p>2.20 kg CO2e / kg (A1-A3)</p>
          </article>
          <footer>
            <p>Get Rebuilt updates</p>
            <a href="/privacy-policy">Privacy Policy</a>
          </footer>
        </main>
      </body>`;

    const converter = new MarkdownConverter();
    const markdown = converter.convert(html);

    expect(markdown).toContain("Primed flatsheets");
    expect(markdown).toContain("Upfront Carbon Emissions");
    expect(markdown).not.toContain("Browse products");
    expect(markdown).not.toContain("Get Rebuilt updates");
    expect(markdown).not.toContain("Privacy Policy");
  });

  it("converts relative links and image sources to absolute URLs when baseUrl is provided", () => {
    const html = `
      <body>
        <main>
          <h1>Product Page</h1>
          <a href="/product/94879ca7-40f2-4a13-8c72-f0f941220132">Classic</a>
          <a href="../about-us">About</a>
          <a href="https://example.org/external">External</a>
          <a href="mailto:team@example.org">Email</a>
          <img src="/images/product.png" alt="Product image" />
        </main>
      </body>`;

    const converter = new MarkdownConverter();
    const markdown = converter.convert(html, {
      baseUrl: "https://rebuilt.eco/product/2fd68bae-5cc7-41f0-bb30-bc67f3f6f740",
    });

    expect(markdown).toContain("(https://rebuilt.eco/product/94879ca7-40f2-4a13-8c72-f0f941220132)");
    expect(markdown).toContain("(https://rebuilt.eco/about-us)");
    expect(markdown).toContain("(https://example.org/external)");
    expect(markdown).toContain("(mailto:team@example.org)");
    expect(markdown).toContain("(https://rebuilt.eco/images/product.png)");
  });

  it("removes generic utility button controls from extracted content", () => {
    const html = `
      <body>
        <main>
          <h1>Product Title</h1>
          <button>Add to shortlist</button>
          <button>Log in</button>
          <p>Upfront Carbon Emissions: 2.20 kg CO2e</p>
        </main>
      </body>`;

    const converter = new MarkdownConverter();
    const markdown = converter.convert(html);

    expect(markdown).toContain("Product Title");
    expect(markdown).toContain("Upfront Carbon Emissions");
    expect(markdown).not.toContain("Add to shortlist");
    expect(markdown).not.toContain("Log in");
  });

  it("separates dense adjacent link runs to avoid unreadable link blobs", () => {
    const html = `
      <body>
        <main>
          <h2>Links</h2>
          <p><a href="/p/one">One product with a long descriptive title</a><a href="/p/two">Two product with a long descriptive title</a><a href="/p/three">Three product with a long descriptive title</a> supporting context text so this remains part of the main article body.</p>
        </main>
      </body>`;

    const converter = new MarkdownConverter();
    const markdown = converter.convert(html, { baseUrl: "https://example.com/products/x" });

    expect(markdown).toContain("[One product with a long descriptive title](https://example.com/p/one)");
    expect(markdown).toContain("[Two product with a long descriptive title](https://example.com/p/two)");
    expect(markdown).toContain("[Three product with a long descriptive title](https://example.com/p/three)");
    expect(markdown).not.toContain("](https://example.com/p/one)[");
    expect(markdown).not.toContain("](https://example.com/p/two)[");
  });

  it("keeps heading-led content sections even when they contain many links", () => {
    const html = `
      <body>
        <main>
          <section>
            <h2>Recent News</h2>
            <a href="/news/1">Launch update</a>
            <a href="/news/2">Research update</a>
            <a href="/news/3">Safety update</a>
          </section>
        </main>
      </body>`;

    const converter = new MarkdownConverter();
    const markdown = converter.convert(html, { baseUrl: "https://example.com/" });

    expect(markdown).toContain("Recent News");
    expect(markdown).toContain("(https://example.com/news/1)");
    expect(markdown).toContain("(https://example.com/news/2)");
    expect(markdown).toContain("(https://example.com/news/3)");
  });

  it("preserves content in pages with no semantic main/article where nav siblings inflate link density", () => {
    const html = `
      <body>
        <div class="layout-wrapper">
          <div class="sidebar">
            <nav>
              <a href="/docs/a">Getting Started</a>
              <a href="/docs/b">Configuration</a>
              <a href="/docs/c">Plugins</a>
              <a href="/docs/d">API Reference</a>
              <a href="/docs/e">Migration Guide</a>
              <a href="/docs/f">FAQ</a>
            </nav>
          </div>
          <div class="docs-content">
            <h1>Getting Started</h1>
            <p>Install the package using your preferred package manager. This guide walks you through
               setting up the project from scratch, including configuration and first steps.</p>
            <h2>Installation</h2>
            <p>Run the following command to install the dependencies needed for the project.</p>
            <pre><code>npm install my-framework</code></pre>
            <h2>Configuration</h2>
            <p>Create a configuration file in your project root with the following content to get started.</p>
          </div>
        </div>
      </body>`;

    const converter = new MarkdownConverter();
    const markdown = converter.convert(html);

    expect(markdown).toContain("Getting Started");
    expect(markdown).toContain("Installation");
    expect(markdown).toContain("npm install my-framework");
    expect(markdown).toContain("Configuration");
    expect(markdown).toContain("configuration file");
  });

  it("preserves doc content when navigation and content share a container with no semantic markers", () => {
    const html = `
      <body>
        <div class="page">
          <div class="top-nav">
            <a href="/">Home</a>
            <a href="/docs">Docs</a>
            <a href="/api">API</a>
            <a href="/blog">Blog</a>
            <a href="/community">Community</a>
          </div>
          <div class="grid">
            <div class="sidebar-nav">
              <a href="/docs/intro">Intro</a>
              <a href="/docs/setup">Setup</a>
              <a href="/docs/config">Config</a>
              <a href="/docs/deploy">Deploy</a>
              <a href="/docs/testing">Testing</a>
              <a href="/docs/advanced">Advanced</a>
              <a href="/docs/plugins">Plugins</a>
              <a href="/docs/themes">Themes</a>
            </div>
            <div class="content-area">
              <h1>Introduction</h1>
              <p>Welcome to the framework documentation. This comprehensive guide covers everything
                 you need to know about building applications with our tools.</p>
              <h2>Quick Start</h2>
              <p>Follow these steps to create your first project and deploy it to production in under five minutes.</p>
              <h3>Prerequisites</h3>
              <p>You will need Node.js version 18 or later and a package manager like npm or pnpm installed.</p>
            </div>
          </div>
        </div>
      </body>`;

    const converter = new MarkdownConverter();
    const markdown = converter.convert(html);

    expect(markdown).toContain("Introduction");
    expect(markdown).toContain("Quick Start");
    expect(markdown).toContain("Prerequisites");
    expect(markdown).toContain("comprehensive guide");
  });
});
